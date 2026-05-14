import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { fetchProblem, fetchProblems, fetchHealth } from '@/lib/api';
import { ProblemWorkspace } from './ProblemWorkspace';
import Loading from './loading';

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

  let problem;
  try {
    problem = await fetchProblem(id);
  } catch {
    notFound();
  }

  const [problems, health] = await Promise.all([fetchProblems(), fetchHealth().catch(() => ({ status: 'ok' as const, warnings: [] }))]);

  // Compute prev/next IDs server-side to avoid serializing full list to client
  const idx = problems.findIndex(p => p.id === id);
  const prevId = idx > 0 ? problems[idx - 1].id : null;
  const nextId = idx < problems.length - 1 ? problems[idx + 1].id : null;

  // Next.js 16: run work after the response is sent to the client
  after(() => {
    console.log(`[page] Problem viewed: ${id} (${problem.title})`);
  });

  return (
    <Suspense fallback={<Loading />}>
      <ProblemWorkspace
        problem={problem}
        prevId={prevId}
        nextId={nextId}
        healthWarnings={health.warnings}
      />
    </Suspense>
  );
}
