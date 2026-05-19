import fs from 'node:fs';
import path from 'node:path';
import { BUILD_ROOT, CCACHE_DIR, PROBLEMS_DIR } from '../common/paths.js';
import { TOOLCHAIN } from '../common/toolchain.js';
import { spawnLimited, shellQuote } from './resource-limits.js';
import { parseJUnit } from './junit.js';
import type { StreamCallback } from './event-emitter.js';

/**
 * CMake-based runner with persistent per-user, per-problem build directory.
 *
 * Strategy:
 *   1. Per-user staging tree at `.builds/<userId>/<problemId>/src/` mirrors
 *      `problems/<problemId>/`. The canonical problems/ dir is never written
 *      to — two users hitting the same problem cannot race each other's
 *      source state, and an interrupted run can't leave problems/ dirty.
 *   2. User-edited files are overlaid into the staging src tree on top of
 *      the canonical mirror.
 *   3. `cmake -S <staging-src> -B <staging-build>` with ccache as the
 *      compiler launcher. Identical-content files keep their mtimes so
 *      ninja/make incremental builds stay valid across runs.
 *   4. `ctest --output-junit results.xml` to get structured per-test results
 *      instead of regex-scanning stdout.
 *   5. Parse JUnit XML → emit per-test sentinel-shaped events.
 */
export async function runCmake(
  problemId: string,
  userFiles: Record<string, string>,
  mode: 'run' | 'test',
  entrypoint: string,
  emit: StreamCallback,
  signal: AbortSignal,
  userId: string,
): Promise<{ passed: number; total: number; exitCode: number }> {
  const problemDir = path.join(PROBLEMS_DIR, problemId);
  const safeUser = sanitizeUserId(userId);
  const userDir = path.join(BUILD_ROOT, safeUser, problemId);
  const srcDir = path.join(userDir, 'src');
  const buildDir = path.join(userDir, 'build');
  await fs.promises.mkdir(srcDir, { recursive: true });
  await fs.promises.mkdir(buildDir, { recursive: true });
  await fs.promises.mkdir(CCACHE_DIR, { recursive: true });

  // Mirror the canonical problem dir into the per-user staging tree, then
  // overlay user code on top. The mirror also wipes any stale files left by
  // a previous run (e.g. user-added files no longer present in this run).
  await mirrorDir(problemDir, srcDir);
  for (const [filename, content] of Object.entries(userFiles)) {
    const filePath = path.join(srcDir, filename);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await writeIfDiffers(filePath, content);
  }

  let passed = 0;
  let total = 0;
  let exitCode = 0;

  const env: NodeJS.ProcessEnv = { ...process.env, CCACHE_DIR };

  // Configure (idempotent — fast on cached builds)
  emit({ kind: 'compile-start' });
  const ccacheFlags = TOOLCHAIN.ccache
    ? '-DCMAKE_CXX_COMPILER_LAUNCHER=ccache -DCMAKE_C_COMPILER_LAUNCHER=ccache'
    : '';
  const configure = spawnLimited(
    `cmake -S "${srcDir}" -B "${buildDir}" ${ccacheFlags}`,
    { cwd: buildDir, env, limits: { cpuSeconds: 60, wallMs: 60_000 }, signal },
  );
  // Only pipe stderr from configure/build — stdout is noisy CMake progress
  pipeStderrOnly(configure.child, emit);
  const configureResult = await configure.done;
  if (configureResult.exitCode !== 0) {
    emit({ kind: 'compile-end', exitCode: configureResult.exitCode, killedByTimeout: configureResult.killedByTimeout });
    return { passed: 0, total: 0, exitCode: configureResult.exitCode };
  }

  // Build. `--parallel` with no count defaults to the host's logical core
  // count, which means two concurrent users on a Catch2-heavy problem
  // (different userIds, different in-flight slots — the registry keys on
  // user+problem, not problem alone) can spawn 2 * NCPU compile jobs and
  // oversubscribe the box. Cap at 2 so a sibling run can coexist on a
  // multi-core host without either run starving the other; the incremental
  // Catch2 builds we actually run aren't compile-bound enough for a higher
  // cap to be load-bearing. If a future operator needs to tune this, a
  // POTD_CMAKE_PARALLEL env knob is the right next step; a literal 2 is
  // fine for the current corpus.
  const build = spawnLimited(`cmake --build "${buildDir}" --parallel 2`, {
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
  if (mode === 'run') {
    const runResult = await runExecutable(buildDir, entrypoint, env, signal, emit);
    exitCode = runResult.exitCode;
  } else {
    emit({ kind: 'run-start' });
    const junitPath = path.join(buildDir, 'results.xml');
    await fs.promises.rm(junitPath, { force: true });
    // Match the configure/build limits above (60s CPU / 60s wall). Without
    // explicit limits this spawn falls back to DEFAULT_LIMITS — 10s CPU,
    // 15s wall — set in resource-limits.ts. The configure and build spawns
    // already explicitly override those defaults; ctest used to inherit
    // them, so a test suite that took >10s of CPU got SIGKILL'd mid-run.
    // ctest then exited non-zero and the runner read whatever
    // results.xml fragment had been flushed before the kill, reporting a
    // truncated passed/total to the user with no signal that the suite
    // had been cut off. Any of the existing CS 225 problems that bundle
    // a Catch2 harness with dozens of tests can plausibly cross the
    // 10s default once test isolation overhead is factored in.
    const ctest = spawnLimited(`ctest --output-junit "${junitPath}" --output-on-failure`, {
      cwd: buildDir,
      env,
      limits: { cpuSeconds: 60, wallMs: 60_000 },
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
        // Map JUnit status → sentinel status. `error` (test crashed / couldn't
        // run) becomes `crash` in the wire format the UI consumes; the other
        // three names align 1:1.
        const sentinelStatus =
          t.status === 'error' ? 'crash' as const : t.status;
        const base = { type: 'test' as const, name: t.name, status: sentinelStatus };
        const withMessage = t.message != null ? { ...base, message: t.message } : base;
        const withDuration = t.durationMs != null
          ? { ...withMessage, durationMs: t.durationMs }
          : withMessage;
        emit({ kind: 'sentinel', event: withDuration });
      }
      emit({ kind: 'sentinel', event: { type: 'result', passed, total } });
    }
    emit({ kind: 'run-end', exitCode, killedByTimeout: ctestResult.killedByTimeout });
  }

  return { passed, total, exitCode };
}

/**
 * Make `dest` a content-identical copy of `src` (recursive). Files whose
 * bytes already match are left alone so cmake/ninja incremental builds keep
 * their mtime-based change detection working. Anything present in `dest`
 * but absent from `src` is removed.
 *
 * Exported for tests.
 */
export async function mirrorDir(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const srcEntries = await fs.promises.readdir(src, { withFileTypes: true });
  const srcNames = new Set(srcEntries.map(e => e.name));

  const destEntries = await fs.promises.readdir(dest, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
  for (const entry of destEntries) {
    if (!srcNames.has(entry.name)) {
      await fs.promises.rm(path.join(dest, entry.name), { recursive: true, force: true });
    }
  }

  for (const entry of srcEntries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await mirrorDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFileIfDiffers(srcPath, destPath);
    }
    // symlinks and other special entries are intentionally skipped — CS 225
    // problem trees don't use them and we don't want to follow them blindly.
  }
}

async function copyFileIfDiffers(src: string, dest: string): Promise<void> {
  const srcContent = await fs.promises.readFile(src);
  try {
    const destContent = await fs.promises.readFile(dest);
    if (srcContent.equals(destContent)) return;
  } catch {
    /* dest doesn't exist — fall through to write */
  }
  await fs.promises.writeFile(dest, srcContent);
}

async function writeIfDiffers(filePath: string, content: string): Promise<void> {
  try {
    const current = await fs.promises.readFile(filePath, 'utf8');
    if (current === content) return;
  } catch {
    /* not yet present — fall through to write */
  }
  await fs.promises.writeFile(filePath, content);
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

/**
 * Resolve the path of the assignment binary to invoke for /run.
 *
 * Preference order:
 *   1. <buildDir>/<entrypoint> — meta.entrypoint names the binary the
 *      problem author wants /run to invoke. CS 225 cmake problems
 *      typically build BOTH this and a separate Catch2 `test` binary
 *      in the same directory; without this precedence rule, readdir
 *      order would silently invoke the test harness on /run.
 *   2. Any executable file in the build dir — last-resort heuristic for
 *      problems where meta.entrypoint doesn't directly correspond to a
 *      built binary name (haven't seen this in the current corpus, but
 *      it preserves the previous behavior rather than hard-failing).
 *
 * Exported for tests.
 */
export async function findRunnableBinary(buildDir: string, entrypoint: string): Promise<string> {
  // 1. Direct match on entrypoint — fast path, no directory scan.
  const direct = path.join(buildDir, entrypoint);
  try {
    const st = await fs.promises.stat(direct);
    if (st.isFile()) {
      await fs.promises.access(direct, fs.constants.X_OK);
      return `./${entrypoint}`;
    }
  } catch {
    /* fall through */
  }

  // 2. Fallback: first executable file in the build dir.
  const entries = await fs.promises.readdir(buildDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const p = path.join(buildDir, entry.name);
    try {
      await fs.promises.access(p, fs.constants.X_OK);
      return `./${entry.name}`;
    } catch {
      /* skip */
    }
  }
  throw new Error('No runnable binary found in build directory');
}

/**
 * Locate the assignment binary and stream its execution.
 *
 * findRunnableBinary runs BEFORE emit('run-start'): if no executable is
 * present in the build directory it throws, the throw escapes back to the
 * controller's catch block, and the SSE stream closes with a single
 * 'error' event. Pre-fix this lookup happened AFTER 'run-start', producing
 * a stream that opened a run-start it never paired with a run-end —
 * legal for the frontend's current consumers but a contract violation
 * the cmake-runner shouldn't rely on for terminal-state correctness.
 *
 * Exported so the "no orphan run-start when binary missing" invariant can
 * be exercised in tests without spinning up an actual cmake build.
 */
export async function runExecutable(
  buildDir: string,
  entrypoint: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  emit: StreamCallback,
): Promise<{ exitCode: number }> {
  const bin = await findRunnableBinary(buildDir, entrypoint);
  emit({ kind: 'run-start' });
  const run = spawnLimited(shellQuote(bin), { cwd: buildDir, env, signal });
  pipeRawChild(run.child, emit);
  const runResult = await run.done;
  emit({ kind: 'run-end', exitCode: runResult.exitCode, killedByTimeout: runResult.killedByTimeout });
  return { exitCode: runResult.exitCode };
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
