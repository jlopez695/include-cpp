/**
 * Resource-limited child process spawning.
 *
 * Wraps the target command with `bash -c 'ulimit ...; exec <cmd>'` so the kernel
 * caps CPU time, virtual memory, and file size. Wall-clock timeout is enforced
 * by the parent killing the process group.
 *
 * Notes on ulimit semantics:
 *   - `-t` (CPU seconds) — wall-clock-independent CPU usage cap. Reliable.
 *   - `-f` (file size KB) — caps individual file growth. Reliable.
 *   - `-v` (virtual address space KB) — this is ADDRESS SPACE, not RSS. Some
 *     C++ programs that load big shared libraries (or mmap large files) can
 *     trip this falsely. On macOS this is silently ignored; on Linux it's
 *     enforced. For real RSS-based isolation you need cgroups (Linux) or
 *     other sandbox tech. ulimit is a coarse safety net, not real isolation.
 */

import { spawn, ChildProcess } from 'node:child_process';

/**
 * POSIX-safe single-quote escape for a single shell word.
 *
 * {@link spawnLimited} always wraps its command in `bash -c '...'` so that
 * ulimit can be applied — there is no `shell: false` fast path. That means
 * any filesystem path or argument interpolated into the command string is
 * subject to word splitting on whitespace, glob expansion on `*?[`, and
 * variable expansion on `$`. Callers that splice in author-controlled
 * paths (e.g. `meta.entrypoint` from a problem's meta.json) must run them
 * through this helper or the shell will misparse anything that isn't a
 * bare identifier.
 *
 * The escape strategy is the standard POSIX one: wrap in single quotes,
 * and escape any literal single quote as `'\''` (close, escaped quote,
 * reopen). Examples:
 *   shellQuote("main")           === "'main'"
 *   shellQuote("./hello world")  === "'./hello world'"
 *   shellQuote("with'apostrophe")=== "'with'\\''apostrophe'"
 *
 * No-op-safe for already-safe inputs: the surrounding quotes are dropped
 * by bash before exec, so the resulting argv is identical to the unquoted
 * form when the input had no shell metacharacters.
 */
export function shellQuote(word: string): string {
  return `'${word.replace(/'/g, "'\\''")}'`;
}

export interface ResourceLimits {
  /** CPU time in seconds (ulimit -t). */
  cpuSeconds: number;
  /** Virtual memory in KB (ulimit -v). macOS ignores this silently; Linux enforces. */
  memoryKb: number;
  /** File size in KB (ulimit -f). Prevents disk-fill. */
  fileSizeKb: number;
  /** Wall-clock timeout in ms. Enforced by parent SIGKILL. */
  wallMs: number;
}

export const DEFAULT_LIMITS: ResourceLimits = {
  cpuSeconds: 10,
  memoryKb: 512 * 1024,
  fileSizeKb: 64 * 1024,
  wallMs: 15_000,
};

export interface SpawnResult {
  child: ChildProcess;
  /** Promise that resolves with exit info once the child exits or is killed. */
  done: Promise<{ exitCode: number; signal: NodeJS.Signals | null; killedByTimeout: boolean }>;
}

export function spawnLimited(
  command: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    limits?: Partial<ResourceLimits>;
    signal?: AbortSignal;
  },
): SpawnResult {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const ulimit = [
    `ulimit -t ${limits.cpuSeconds}`,
    `ulimit -v ${limits.memoryKb} 2>/dev/null || true`,
    `ulimit -f ${limits.fileSizeKb}`,
  ].join('; ');

  const wrapped = `${ulimit}; exec ${command}`;

  const child = spawn('bash', ['-c', wrapped], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group so we can SIGKILL the whole tree
  });

  let killedByTimeout = false;
  const wallTimer = setTimeout(() => {
    killedByTimeout = true;
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, limits.wallMs);

  const onAbort = () => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  const done = new Promise<{ exitCode: number; signal: NodeJS.Signals | null; killedByTimeout: boolean }>(resolve => {
    // Use `close`, not `exit`: `exit` fires when the process exits, but
    // stdout/stderr may still have buffered chunks not yet delivered to
    // 'data' listeners. `close` fires after all streams have been drained.
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    child.once('exit', (code, signal) => {
      exitInfo = { code, signal };
    });
    child.once('close', (code, signal) => {
      clearTimeout(wallTimer);
      options.signal?.removeEventListener('abort', onAbort);
      const info = exitInfo ?? { code, signal };
      resolve({ exitCode: info.code ?? 1, signal: info.signal, killedByTimeout });
    });
  });

  return { child, done };
}
