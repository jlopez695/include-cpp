import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CCACHE_DIR, PROBLEMS_DIR, SHARED_INCLUDE_DIR } from '../common/paths.js';
import { TOOLCHAIN } from '../common/toolchain.js';
import { spawnLimited } from './resource-limits.js';
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
    const run = spawnLimited(`./${entrypoint}`, { cwd: tmpDir, env, signal });
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

    const events = parseSentinels(ready);
    for (const ev of events) {
      onSentinel?.(ev);
      emit({ kind: 'sentinel', event: ev });
    }
    const clean = stripSentinels(ready);
    if (clean) emit({ kind: 'stdout', data: clean });
  };

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (data: string) => consumeStdout(data));
  child.stdout?.on('end', () => {
    if (stdoutTail) emit({ kind: 'stdout', data: stdoutTail });
    stdoutTail = '';
  });
  child.stderr?.on('data', (data: string) => emit({ kind: 'stderr', data }));
}
