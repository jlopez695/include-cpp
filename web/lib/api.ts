import type { ProblemSummary, ProblemDetail, HealthResponse } from './types';

const BASE = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

// Tags HTTP failures so callers can distinguish a real 404 (problem
// doesn't exist) from a 5xx or transport error (backend down). The
// problem-detail page uses this to choose between notFound() and
// letting the error bubble to error.tsx — without it, an API outage
// shows users "Not Found" instead of the actual failure.
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function fetchProblems(): Promise<ProblemSummary[]> {
  const res = await fetch(`${BASE}/api/problems`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new ApiError(`Failed to fetch problems: ${res.status}`, res.status);
  return res.json();
}

export async function fetchProblem(id: string): Promise<ProblemDetail> {
  const res = await fetch(`${BASE}/api/problems/${id}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new ApiError(`Failed to fetch problem ${id}: ${res.status}`, res.status);
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/api/health`, { next: { revalidate: 300 } });
  if (!res.ok) throw new ApiError(`Failed to fetch health: ${res.status}`, res.status);
  return res.json();
}
