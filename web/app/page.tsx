import { redirect } from 'next/navigation';
import { fetchProblems } from '@/lib/api';
import type { ProblemSummary } from '@/lib/types';

// This route is a redirect-only shim — there's no static HTML worth
// prerendering. Marking it dynamic also stops `next build` from failing
// when the backend isn't reachable at build time (CI, fresh checkout,
// non-prod environments), since the fetch only runs on actual requests.
export const dynamic = 'force-dynamic';

export default async function Home() {
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
    <div className="flex items-center justify-center h-screen text-text-dim">
      No problems found. Add a problem to the problems/ directory.
    </div>
  );
}
