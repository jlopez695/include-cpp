import { Suspense } from 'react';
import { fetchProblem, fetchProblems } from '@/lib/api';
import { ProblemWorkspace } from './ProblemWorkspace';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  try {
    const problems = await fetchProblems();
    return problems.map(p => ({ id: p.id }));
  } catch {
    return [];
  }
}

export default async function ProblemPage({ params }: Props) {
  const { id } = await params;
  const [problem, problems] = await Promise.all([
    fetchProblem(id),
    fetchProblems(),
  ]);

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center flex-1 text-text-dim">
          Loading {id}...
        </div>
      }
    >
      <ProblemWorkspace problem={problem} problems={problems} />
    </Suspense>
  );
}
