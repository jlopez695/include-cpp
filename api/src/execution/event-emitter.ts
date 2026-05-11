import type { SentinelEvent } from './sentinel.js';

/** Events streamed over SSE to the frontend. */
export type StreamEvent =
  | { kind: 'stdout'; data: string }
  | { kind: 'stderr'; data: string }
  | { kind: 'sentinel'; event: SentinelEvent }
  | { kind: 'compile-start' }
  | { kind: 'compile-end'; exitCode: number; killedByTimeout: boolean }
  | { kind: 'run-start' }
  | { kind: 'run-end'; exitCode: number; killedByTimeout: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'done'; passed: number; total: number; exitCode: number };

export type StreamCallback = (event: StreamEvent) => void;
