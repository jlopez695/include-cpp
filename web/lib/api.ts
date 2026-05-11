import type { ProblemSummary, ProblemDetail, HealthResponse } from './types';

const BASE = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

export async function fetchProblems(): Promise<ProblemSummary[]> {
  const res = await fetch(`${BASE}/api/problems`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Failed to fetch problems: ${res.status}`);
  return res.json();
}

export async function fetchProblem(id: string): Promise<ProblemDetail> {
  const res = await fetch(`${BASE}/api/problems/${id}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Failed to fetch problem ${id}: ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/api/health`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch health: ${res.status}`);
  return res.json();
}
