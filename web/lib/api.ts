import type { ProblemSummary, ProblemDetail, HealthResponse } from './types';

const BASE = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

// Wall-clock cap on every fetch in this module. Browser fetch has NO
// default timeout, and Next.js 16's data layer does not apply one for
// us either — without an AbortController the page-level promise hangs
// indefinitely if the API stops responding mid-request. The user sees
// a spinner forever and the diagnostic ("the API is down") never
// surfaces. 10s is comfortably above the slowest healthy path in this
// codebase (cmake configure-cache cold start ~2-3s on a fresh box)
// but short enough that a stalled backend produces a visible failure
// inside a single attention span.
const FETCH_TIMEOUT_MS = 10_000;

// Tags HTTP failures so callers can distinguish a real 404 (problem
// doesn't exist) from a 5xx or transport error (backend down). The
// problem-detail page uses this to choose between notFound() and
// letting the error bubble to error.tsx — without it, an API outage
// shows users "Not Found" instead of the actual failure.
//
// 504 (Gateway Timeout) is also used here for client-side timeouts:
// the browser aborted the request before the server could reply, so
// the result is shaped the same as an upstream timeout from the API's
// perspective. Callers that branch on `status === 504` (the error
// boundary at app/error.tsx is the main consumer) get a coherent
// "backend slow / unreachable" path either way.
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Wrap fetch in an AbortController. fetch() rejects with an
// AbortError DOMException when the signal aborts, which we catch and
// rethrow as an ApiError(504) so callers see a tagged failure
// consistent with the other ApiError sites. The clearTimeout in
// .finally is important — without it the timer would keep firing
// AFTER a successful fast response and call controller.abort() on a
// settled controller (no effect, but it's noise in DevTools).
async function fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError(`Timed out fetching ${label} after ${FETCH_TIMEOUT_MS}ms`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchProblems(): Promise<ProblemSummary[]> {
  const res = await fetchWithTimeout(`${BASE}/api/problems`, { next: { revalidate: 3600 } } as RequestInit, 'problems');
  if (!res.ok) throw new ApiError(`Failed to fetch problems: ${res.status}`, res.status);
  return res.json();
}

export async function fetchProblem(id: string): Promise<ProblemDetail> {
  const res = await fetchWithTimeout(`${BASE}/api/problems/${id}`, { next: { revalidate: 3600 } } as RequestInit, `problem ${id}`);
  if (!res.ok) throw new ApiError(`Failed to fetch problem ${id}: ${res.status}`, res.status);
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetchWithTimeout(`${BASE}/api/health`, { next: { revalidate: 300 } } as RequestInit, 'health');
  if (!res.ok) throw new ApiError(`Failed to fetch health: ${res.status}`, res.status);
  return res.json();
}
