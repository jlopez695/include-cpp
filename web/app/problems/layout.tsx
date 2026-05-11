import { Suspense } from 'react';
import { fetchProblems } from '@/lib/api';
import { SidebarWrapper } from './SidebarWrapper';

export default async function ProblemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const problems = await fetchProblems();

  return (
    <div className="flex h-screen overflow-hidden bg-bg-0">
      <Suspense
        fallback={
          <aside className="w-60 min-w-60 bg-bg-1 border-r border-border-soft animate-pulse" />
        }
      >
        <SidebarWrapper problems={problems} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
