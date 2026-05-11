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
    <Suspense fallback={<WorkspaceSkeleton />}>
      <ProblemWorkspace problem={problem} problems={problems} />
    </Suspense>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* TopBar skeleton */}
      <div className="h-12 flex items-center px-5 bg-bg-1 border-b border-border-soft shrink-0 gap-3">
        <div className="w-16 h-6 rounded-md animate-shimmer" />
        <div className="w-40 h-5 rounded animate-shimmer" />
      </div>
      {/* Body skeleton */}
      <div className="flex-1 flex overflow-hidden">
        {/* Description panel */}
        <div className="w-[38%] bg-bg-1 border-r border-border-soft p-5 flex flex-col gap-3">
          <div className="w-3/4 h-5 rounded animate-shimmer" />
          <div className="w-full h-3 rounded animate-shimmer" />
          <div className="w-full h-3 rounded animate-shimmer" />
          <div className="w-2/3 h-3 rounded animate-shimmer" />
          <div className="w-full h-3 rounded animate-shimmer mt-3" />
          <div className="w-5/6 h-3 rounded animate-shimmer" />
        </div>
        {/* Editor panel */}
        <div className="flex-1 flex flex-col bg-bg-0">
          <div className="h-9 bg-bg-1 border-b border-border-soft flex items-center px-3 gap-4">
            <div className="w-20 h-4 rounded animate-shimmer" />
            <div className="w-16 h-4 rounded animate-shimmer" />
          </div>
          <div className="flex-1 bg-[#1e1e1e] p-4 flex flex-col gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="rounded animate-shimmer" style={{ width: `${40 + Math.random() * 50}%`, height: 14 }} />
            ))}
          </div>
        </div>
      </div>
      {/* StatusBar skeleton */}
      <div className="h-[26px] bg-bg-1 border-t border-border-soft" />
    </div>
  );
}
