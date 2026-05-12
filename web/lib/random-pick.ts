import type { ProblemSummary } from './types';
import type { Status } from './types';

/**
 * Pick a random problem, preferring unsolved, then attempted.
 * Excludes the current problem. Returns null if no other problems exist.
 */
export function pickRandom(
  problems: ProblemSummary[],
  statuses: Record<string, Status>,
  currentId: string,
): string | null {
  const others = problems.filter(p => p.id !== currentId);
  if (others.length === 0) return null;

  const unsolved = others.filter(p => (statuses[p.id] ?? 'unsolved') === 'unsolved');
  if (unsolved.length > 0) return unsolved[Math.floor(Math.random() * unsolved.length)].id;

  const attempted = others.filter(p => statuses[p.id] === 'attempted');
  if (attempted.length > 0) return attempted[Math.floor(Math.random() * attempted.length)].id;

  return others[Math.floor(Math.random() * others.length)].id;
}
