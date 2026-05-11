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
