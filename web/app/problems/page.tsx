import { redirect } from 'next/navigation';
import { fetchProblems } from '@/lib/api';
import type { ProblemSummary } from '@/lib/types';

// Redirect-only shim — see app/page.tsx for the same rationale. No
// static HTML worth prerendering, and prerendering forces the build
// to depend on the backend being reachable.
export const dynamic = 'force-dynamic';

export default async function ProblemsIndex() {
  let problems: ProblemSummary[];
  try {
    problems = await fetchProblems();
  } catch {
    problems = [];
  }
  if (problems.length > 0) {
    redirect(`/problems/${problems[0].id}`);
  }
  return (
    <div className="flex items-center justify-center flex-1 text-text-dim">
      No problems available.
    </div>
  );
}
