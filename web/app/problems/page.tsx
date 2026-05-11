import { redirect } from 'next/navigation';
import { fetchProblems } from '@/lib/api';

export default async function ProblemsIndex() {
  const problems = await fetchProblems();
  if (problems.length > 0) {
    redirect(`/problems/${problems[0].id}`);
  }
  return (
    <div className="flex items-center justify-center flex-1 text-text-dim">
      No problems available.
    </div>
  );
}
