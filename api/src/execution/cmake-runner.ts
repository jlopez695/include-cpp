import fs from 'node:fs';
import path from 'node:path';
import { BUILD_ROOT, CCACHE_DIR, PROBLEMS_DIR } from '../common/paths.js';
import { TOOLCHAIN } from '../common/toolchain.js';
import { spawnLimited } from './resource-limits.js';
import { parseJUnit } from './junit.js';
import type { StreamCallback } from './event-emitter.js';

/**
 * CMake-based runner with persistent per-user, per-problem build directory.
 *
 * Strategy:
 *   1. Build dir at `.builds/<userId>/<problemId>/` — scoped per user so two
 *      users hitting the same problem don't trash each other's incremental
 *      state. Same user concurrent runs are serialized by InFlightRegistry.
 *   2. Mirror user-edited files into the source tree (they live in named
 *      paths like `src/final.cpp`); cmake re-detects on file change.
 *   3. `cmake --build` with ccache as the compiler launcher.
 *   4. `ctest --output-junit results.xml` to get structured per-test results
 *      instead of regex-scanning stdout.
 *   5. Parse JUnit XML → emit per-test sentinel-shaped events.
 */
export async function runCmake(
  problemId: string,
  userFiles: Record<string, string>,
  mode: 'run' | 'test',
  emit: StreamCallback,
  signal: AbortSignal,
  userId: string,
): Promise<{ passed: number; total: number; exitCode: number }> {
  const problemDir = path.join(PROBLEMS_DIR, problemId);
  const safeUser = sanitizeUserId(userId);
  const buildDir = path.join(BUILD_ROOT, safeUser, problemId);
  await fs.promises.mkdir(buildDir, { recursive: true });
  await fs.promises.mkdir(CCACHE_DIR, { recursive: true });

  // Snapshot user file overlays into the source tree. We restore on exit so
  // we don't leave the canonical problems/ dir mutated.
  const originals = new Map<string, string | null>();
  for (const filename of Object.keys(userFiles)) {
    const filePath = path.join(problemDir, filename);
    try {
      originals.set(filename, await fs.promises.readFile(filePath, 'utf8'));
    } catch {
      originals.set(filename, null);
    }
  }

  let passed = 0;
  let total = 0;
  let exitCode = 0;

  try {
    for (const [filename, content] of Object.entries(userFiles)) {
      const filePath = path.join(problemDir, filename);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content);
    }

    const env: NodeJS.ProcessEnv = { ...process.env, CCACHE_DIR };

    // Configure (idempotent — fast on cached builds)
    emit({ kind: 'compile-start' });
    const ccacheFlags = TOOLCHAIN.ccache
      ? '-DCMAKE_CXX_COMPILER_LAUNCHER=ccache -DCMAKE_C_COMPILER_LAUNCHER=ccache'
      : '';
    const configure = spawnLimited(
      `cmake -S "${problemDir}" -B "${buildDir}" ${ccacheFlags}`,
      { cwd: buildDir, env, limits: { cpuSeconds: 60, wallMs: 60_000 }, signal },
    );
    // Only pipe stderr from configure/build — stdout is noisy CMake progress
    pipeStderrOnly(configure.child, emit);
    const configureResult = await configure.done;
    if (configureResult.exitCode !== 0) {
      emit({ kind: 'compile-end', exitCode: configureResult.exitCode, killedByTimeout: configureResult.killedByTimeout });
      return { passed: 0, total: 0, exitCode: configureResult.exitCode };
    }

    // Build
    const build = spawnLimited(`cmake --build "${buildDir}" --parallel`, {
      cwd: buildDir,
      env,
      limits: { cpuSeconds: 60, wallMs: 60_000 },
      signal,
    });
    pipeStderrOnly(build.child, emit);
    const buildResult = await build.done;
    emit({ kind: 'compile-end', exitCode: buildResult.exitCode, killedByTimeout: buildResult.killedByTimeout });
    if (buildResult.exitCode !== 0) {
      return { passed: 0, total: 0, exitCode: buildResult.exitCode };
    }

    // Ensure CTestTestfile.cmake exists — some CS 225 CMakeLists.txt omit
    // enable_testing(), so CMake never generates the entry-point file that
    // ctest reads. catch_discover_tests() still writes *_include.cmake files
    // as a post-build step; we just need to create the glue file.
    await ensureCTestFile(buildDir);

    // Run or test
    emit({ kind: 'run-start' });
    if (mode === 'run') {
      // Find the assignment binary — convention: <buildDir>/<problemId>_<*> or first built executable.
      const bin = await findRunnableBinary(buildDir);
      const run = spawnLimited(bin, { cwd: buildDir, env, signal });
      pipeRawChild(run.child, emit);
      const runResult = await run.done;
      exitCode = runResult.exitCode;
      emit({ kind: 'run-end', exitCode: runResult.exitCode, killedByTimeout: runResult.killedByTimeout });
    } else {
      const junitPath = path.join(buildDir, 'results.xml');
      await fs.promises.rm(junitPath, { force: true });
      const ctest = spawnLimited(`ctest --output-junit "${junitPath}" --output-on-failure`, {
        cwd: buildDir,
        env,
        signal,
      });
      // Suppress ctest's raw stdout (progress lines) — we parse JUnit XML
      // for structured results. Keep stderr for unexpected failures.
      pipeStderrOnly(ctest.child, emit);
      const ctestResult = await ctest.done;
      exitCode = ctestResult.exitCode;

      if (fs.existsSync(junitPath)) {
        const parsed = parseJUnit(await fs.promises.readFile(junitPath, 'utf8'));
        passed = parsed.passed;
        total = parsed.total;
        for (const t of parsed.tests) {
          emit({
            kind: 'sentinel',
            event: t.failure
              ? { type: 'test', name: t.name, status: 'fail', message: t.failure }
              : { type: 'test', name: t.name, status: 'pass' },
          });
        }
        emit({ kind: 'sentinel', event: { type: 'result', passed, total } });
      }
      emit({ kind: 'run-end', exitCode, killedByTimeout: ctestResult.killedByTimeout });
    }
  } finally {
    // Restore original files
    for (const [filename, original] of originals) {
      const filePath = path.join(problemDir, filename);
      if (original === null) {
        await fs.promises.rm(filePath, { force: true }).catch(() => {});
      } else {
        await fs.promises.writeFile(filePath, original).catch(() => {});
      }
    }
  }

  return { passed, total, exitCode };
}

/** Reduce a user id to a filesystem-safe path segment. */
function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anonymous';
}

function pipeRawChild(
  child: import('node:child_process').ChildProcess,
  emit: StreamCallback,
): void {
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (data: string) => emit({ kind: 'stdout', data }));
  child.stderr?.on('data', (data: string) => emit({ kind: 'stderr', data }));
}

/** Pipe only stderr — used for configure/build/ctest where stdout is noisy progress output. */
function pipeStderrOnly(
  child: import('node:child_process').ChildProcess,
  emit: StreamCallback,
): void {
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (data: string) => emit({ kind: 'stderr', data }));
}

async function findRunnableBinary(buildDir: string): Promise<string> {
  // Heuristic: pick the first executable file in the build dir (not a dir).
  const entries = await fs.promises.readdir(buildDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const p = path.join(buildDir, entry.name);
      try {
        await fs.promises.access(p, fs.constants.X_OK);
        return `./${entry.name}`;
      } catch {
        /* skip */
      }
    }
  }
  throw new Error('No runnable binary found in build directory');
}

/**
 * If CTestTestfile.cmake is missing (because the problem's CMakeLists.txt
 * doesn't call enable_testing()), generate one that includes all
 * catch_discover_tests output files (*_include.cmake).
 */
async function ensureCTestFile(buildDir: string): Promise<void> {
  const ctestFile = path.join(buildDir, 'CTestTestfile.cmake');
  if (fs.existsSync(ctestFile)) return;

  const entries = await fs.promises.readdir(buildDir);
  const includes = entries.filter(e => e.endsWith('_include.cmake'));
  if (includes.length === 0) return;

  const lines = includes.map(f => `include("${path.join(buildDir, f)}")`);
  await fs.promises.writeFile(ctestFile, lines.join('\n') + '\n');
}

// parseJUnit lives in ./junit.ts so it can be unit-tested without spawning ctest.
