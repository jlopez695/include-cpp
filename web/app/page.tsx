import { redirect } from 'next/navigation';
import { fetchProblems } from '@/lib/api';

export default async function Home() {
  const problems = await fetchProblems();
  if (problems.length > 0) {
    redirect(`/problems/${problems[0].id}`);
  }
  return (
    <div className="flex items-center justify-center h-screen text-text-dim">
      No problems found. Add a problem to the problems/ directory.
    </div>
  );
}
