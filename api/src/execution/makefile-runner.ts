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
      // Quote the include path. CXXFLAGS is passed via the Makefile to
      // `$(CXX) $(CXXFLAGS) ...` under bash, and an unquoted -I path
      // word-splits on whitespace if SHARED_INCLUDE_DIR contains spaces
      // (e.g. a deploy with PROBLEMS_DIR=/Users/jacoblo/My Drive/225POTD/
      // problems — Google Drive sync paths really do look like this).
      // The compile would then fail with a confusing "no input files"
      // because `c++ -I/Users/jacoblo/My Drive/...` reads "Drive/..." as
      // a positional source argument. The cmake path already quotes
      // through `-S "${srcDir}" -B "${buildDir}"`; this is the symmetric
      // gap on the makefile side.
      CXXFLAGS: `${process.env.CXXFLAGS ?? ''} -I"${SHARED_INCLUDE_DIR}"`.trim(),
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
    // Await the cleanup so the runMakefile promise doesn't resolve while
    // the tmpdir is still on disk. The old fire-and-forget shape was a
    // /tmp leak waiting to happen:
    //   - The HTTP response and the SSE stream both completed and the
    //     enclosing async function resolved before fs.promises.rm flushed.
    //   - If the Node process took a SIGTERM (graceful redeploy) or
    //     SIGKILL (OOM) in the gap between resolve and rm completion, the
    //     dir leaked permanently. macOS reliably clears /tmp on boot but
    //     long-running Linux containers don't, and under sustained load
    //     `/tmp/potd-*` directories briefly accumulated hundreds-deep
    //     between request finish and rm flush.
    //   - It also broke "process exit signals tmpdir cleanup" assumptions
    //     for any teardown wrapper layered on top.
    // The .catch(() => {}) stays — rm failures shouldn't mask the
    // original error that's already escaping through the finally.
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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
    } else if (entry.isFile()) {
      await fs.promises.copyFile(srcPath, destPath);
    }
    // symlinks and other special entries (sockets, fifos, char/block
    // devices) are intentionally skipped. The pre-fix branch fell
    // through to fs.copyFile on anything that wasn't a directory, and
    // copyFile *follows* symlinks: a contributor-poisoned PR that
    // landed `problems/POTDxx/tests/grader.cpp -> /etc/passwd` would
    // have copied the target's contents into the runner's tmpdir,
    // where the next compile step could read host secrets via a
    // crafted `#include`. The cmake-runner's mirrorDir does the same
    // file/directory-only filter for exactly this reason; the
    // makefile-runner was the asymmetric gap.
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

// Per-stream cap on the in-memory accumulator that holds bytes between
// newlines (the line-buffered sentinel parser's lookback window). NOT
// a cap on total run output — total bytes are already bounded by
// ulimit -f in resource-limits.ts. The pre-cap accumulator was a real
// OOM vector: a student program that does `while(1) std::cout << 'x';`
// with no newline accreted directly into V8's heap until the Node
// process hit --max-old-space-size and crashed, taking down ALL
// concurrent runs (not just the offender's). The matching stderr side
// got capped at 64 KB in commit 132ac77 inside the grader harness;
// this is the symmetric fix on the runner-side stdout path.
const MAX_TAIL_BYTES = 256 * 1024;

function pipeChild(
  child: import('node:child_process').ChildProcess,
  emit: StreamCallback,
  onSentinel?: (ev: import('./sentinel.js').SentinelEvent) => void,
): void {
  // Line-buffered so we only parse complete sentinel lines (and never re-emit).
  let stdoutTail = '';

  const consumeStdout = (chunk: string) => {
    stdoutTail += chunk;
    // If the accumulator outgrew the cap with no newline in sight,
    // the buffered text cannot become a sentinel anyway (sentinels
    // are line-bounded), so flush it as raw stdout and reset. The
    // user still sees their output streamed; we just stop holding
    // it indefinitely waiting for a `\n` that may never come.
    // Done as a while-loop so a single huge chunk that's a multiple
    // of MAX_TAIL_BYTES is flushed in cap-sized slices rather than
    // re-entering this branch on the next chunk.
    while (stdoutTail.length > MAX_TAIL_BYTES) {
      const flushTo = MAX_TAIL_BYTES;
      const flushChunk = stdoutTail.slice(0, flushTo);
      stdoutTail = stdoutTail.slice(flushTo);
      emit({ kind: 'stdout', data: flushChunk });
    }
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
