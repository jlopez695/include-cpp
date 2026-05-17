import { Suspense } from 'react';
import { fetchProblems } from '@/lib/api';
import type { ProblemSummary } from '@/lib/types';
import { SidebarWrapper } from './SidebarWrapper';

export default async function ProblemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth — match the other shims (app/page.tsx,
  // app/problems/page.tsx, app/problems/[id]/page.tsx's
  // generateStaticParams). A bare `await fetchProblems()` on the
  // layout makes the entire `/problems/*` subtree depend on the
  // backend being reachable: a transient outage (network blip, backend
  // restart, cold start) propagates to error.tsx for every problem
  // page instead of just rendering an empty sidebar next to a working
  // problem-detail view. Empty fallback degrades the sidebar to its
  // "no matching problems" empty state, which is recoverable as soon
  // as the backend returns; the problem-detail page has its own
  // try/catch + ApiError(404) handling, so it can still render
  // independently when the sidebar list happens to be unavailable.
  let problems: ProblemSummary[];
  try {
    problems = await fetchProblems();
  } catch {
    problems = [];
  }

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
