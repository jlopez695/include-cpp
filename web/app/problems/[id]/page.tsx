import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { fetchProblem, fetchProblems, fetchHealth } from '@/lib/api';
import { renderMarkdown } from '@/lib/markdown-server';
import { findHeavyLazyChunks } from '@/lib/preload-hints';
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

  const [problems, health, markdownHtml, preloadChunks] = await Promise.all([
    fetchProblems(),
    fetchHealth().catch(() => ({ status: 'ok' as const, warnings: [] })),
    renderMarkdown(problem.markdown),
    findHeavyLazyChunks(),
  ]);

  // Compute prev/next IDs server-side to avoid serializing full list to client
  const idx = problems.findIndex(p => p.id === id);
  const prevId = idx > 0 ? problems[idx - 1].id : null;
  const nextId = idx < problems.length - 1 ? problems[idx + 1].id : null;
  // Just the IDs (no titles) for the TopBar's progress pill — a few hundred
  // bytes total even at 60+ problems.
  const problemIds = problems.map(p => p.id);

  // Next.js 16: run work after the response is sent to the client
  after(() => {
    console.log(`[page] Problem viewed: ${id} (${problem.title})`);
  });

  return (
    <Suspense fallback={<Loading />}>
      {preloadChunks.map(href => (
        <link key={href} rel="modulepreload" href={href} as="script" />
      ))}
      {/* Warm the HTTP cache before useHealthCheck (in StatusBar) fires its
          first /api/health request post-hydration. The server-rendered
          healthWarnings already gave us the boot-time snapshot; this is for
          the client-side poller that takes over after mount. */}
      <link rel="preload" as="fetch" href="/api/health" crossOrigin="anonymous" />
      <ProblemWorkspace
        problem={problem}
        prevId={prevId}
        nextId={nextId}
        problemIds={problemIds}
        healthWarnings={health.warnings}
        markdownHtml={markdownHtml}
      />
    </Suspense>
  );
}
