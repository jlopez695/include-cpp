import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CCACHE_DIR, PROBLEMS_DIR, SHARED_INCLUDE_DIR } from '../common/paths.js';
import { TOOLCHAIN } from '../common/toolchain.js';
import { spawnLimited, shellQuote } from './resource-limits.js';
import { parseSentinels, stripSentinels } from './sentinel.js';
import type { StreamCallback } from './event-emitter.js';

/**
 * Makefile-based runner.
 *
 * Uses an isolated tempdir per request (makefile builds are quick — copy cost
 * is negligible). ccache wraps CXX/CC so identical compiles hit the cache.
 * The shared grader harness lives in problems/_shared and is exposed via
 * `-I$(SHARED_INCLUDE)`; the Makefile picks it up from the env.
 */
export async function runMakefile(
  problemId: string,
  userFiles: Record<string, string>,
  mode: 'run' | 'test',
  entrypoint: string,
  emit: StreamCallback,
  signal: AbortSignal,
): Promise<{ passed: number; total: number; exitCode: number }> {
  const problemDir = path.join(PROBLEMS_DIR, problemId);
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `potd-${problemId}-`));

  let passed = 0;
  let total = 0;

  try {
    const exclude = new Set(['build', 'meta.json', 'problem.md']);
    if (mode === 'run') exclude.add('tests');
    await copyDir(problemDir, tmpDir, exclude);

    for (const [filename, content] of Object.entries(userFiles)) {
      const filePath = path.join(tmpDir, filename);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content);
    }

    await fs.promises.mkdir(CCACHE_DIR, { recursive: true });

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CCACHE_DIR,
      CXX: TOOLCHAIN.ccache ? 'ccache c++' : 'c++',
      CC: TOOLCHAIN.ccache ? 'ccache cc' : 'cc',
      SHARED_INCLUDE: SHARED_INCLUDE_DIR,
      CXXFLAGS: `${process.env.CXXFLAGS ?? ''} -I${SHARED_INCLUDE_DIR}`.trim(),
    };

    // Makefile `test` target both compiles and runs; `make` (default) only
    // builds, then we exec the entrypoint separately.
    if (mode === 'test') {
      emit({ kind: 'compile-start' });
      const proc = spawnLimited('make -s test', {
        cwd: tmpDir,
        env,
        limits: { cpuSeconds: 30, wallMs: 30_000 },
        signal,
      });
      pipeChild(proc.child, emit, ev => {
        if (ev.type === 'result') {
          passed = ev.passed;
          total = ev.total;
        }
      });
      const result = await proc.done;
      emit({ kind: 'compile-end', exitCode: result.exitCode, killedByTimeout: result.killedByTimeout });
      return { passed, total, exitCode: result.exitCode };
    }

    // mode === 'run'
    emit({ kind: 'compile-start' });
    const compile = spawnLimited('make -s', {
      cwd: tmpDir,
      env,
      limits: { cpuSeconds: 30, wallMs: 30_000 },
      signal,
    });
    pipeChild(compile.child, emit);
    const compileResult = await compile.done;
    emit({ kind: 'compile-end', exitCode: compileResult.exitCode, killedByTimeout: compileResult.killedByTimeout });
    if (compileResult.exitCode !== 0) {
      return { passed: 0, total: 0, exitCode: compileResult.exitCode };
    }

    emit({ kind: 'run-start' });
    const run = spawnLimited(shellQuote(`./${entrypoint}`), { cwd: tmpDir, env, signal });
    pipeChild(run.child, emit);
    const runResult = await run.done;
    emit({ kind: 'run-end', exitCode: runResult.exitCode, killedByTimeout: runResult.killedByTimeout });
    return { passed, total, exitCode: runResult.exitCode };
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function copyDir(src: string, dest: string, exclude: Set<string>): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, exclude);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Run a chunk of stdout through the sentinel parser and route the results.
 * Sentinel lines become structured events; everything else is emitted as
 * raw stdout (with the sentinel markup stripped). The on-data path and the
 * on-end flush path share this helper — see pipeChild below.
 *
 * Exported for tests so we can pin the end-of-stream flush behavior (a
 * complete sentinel without a trailing newline must still parse as a
 * structured event, not leak verbatim into raw stdout) without spinning
 * up a real subprocess.
 */
export function dispatchStdout(
  text: string,
  emit: StreamCallback,
  onSentinel?: (ev: import('./sentinel.js').SentinelEvent) => void,
): void {
  const events = parseSentinels(text);
  for (const ev of events) {
    onSentinel?.(ev);
    emit({ kind: 'sentinel', event: ev });
  }
  const clean = stripSentinels(text);
  if (clean) emit({ kind: 'stdout', data: clean });
}

function pipeChild(
  child: import('node:child_process').ChildProcess,
  emit: StreamCallback,
  onSentinel?: (ev: import('./sentinel.js').SentinelEvent) => void,
): void {
  // Line-buffered so we only parse complete sentinel lines (and never re-emit).
  let stdoutTail = '';

  const consumeStdout = (chunk: string) => {
    stdoutTail += chunk;
    const lastNewline = stdoutTail.lastIndexOf('\n');
    if (lastNewline < 0) return;
    const ready = stdoutTail.slice(0, lastNewline + 1);
    stdoutTail = stdoutTail.slice(lastNewline + 1);
    dispatchStdout(ready, emit, onSentinel);
  };

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (data: string) => consumeStdout(data));
  child.stdout?.on('end', () => {
    // The leftover tail may be either:
    //   (a) trailing user text without a final newline (the common case
    //       when a problem prints "Hello" with no `endl` and exits), or
    //   (b) a complete sentinel emitted without a trailing newline.
    //
    // Case (b) hits whenever fflush is skipped + the OS doesn't flush
    // line-buffered stdout on exit (rare but possible with abrupt SIGKILL
    // mid-line, custom buffering, or a future harness author who drops
    // the `\n` from printf). Before this change the tail was dumped as
    // RAW stdout — meaning the result sentinel was BOTH lost from the
    // structured event stream AND leaked verbatim into the user-visible
    // output panel. Running tail through the same parser as the on-data
    // path collapses both cases correctly.
    if (stdoutTail) {
      dispatchStdout(stdoutTail, emit, onSentinel);
      stdoutTail = '';
    }
  });
  child.stderr?.on('data', (data: string) => emit({ kind: 'stderr', data }));
}
