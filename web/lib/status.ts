import type { Status, StreamEvent, SentinelEvent } from './types';

/**
 * Infer problem status from a 'done' SSE event.
 * The backend already parsed sentinels — we just check passed/total.
 */
export function inferStatus(event: StreamEvent & { kind: 'done' }): Status {
  if (event.total > 0 && event.passed === event.total) return 'solved';
  if (event.total > 0 || event.exitCode !== 0) return 'attempted';
  return 'unsolved';
}

/**
 * Build a summary string from the done event.
 */
export function buildSummary(event: StreamEvent & { kind: 'done' }): string | null {
  if (event.total === 0) return null;
  const failed = event.total - event.passed;
  if (failed === 0) return `All ${event.total} tests passed`;
  return `${failed} of ${event.total} tests failed`;
}
