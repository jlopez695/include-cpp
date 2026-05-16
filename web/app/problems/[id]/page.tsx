import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { fetchProblem, fetchProblems, fetchHealth, ApiError } from '@/lib/api';
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
  } catch (err) {
    // Only treat a real backend 404 as "not found". Any other failure
    // (5xx, network error, backend down) should propagate to error.tsx
    // so users see the actual problem instead of a misleading 404 page.
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const [problems, health, markdownHtml, preloadChunks] = await Promise.all([
    fetchProblems(),
    fetchHealth().catch(() => ({ status: 'ok' as const, warnings: [] })),
    renderMarkdown(problem.markdown),
    findHeavyLazyChunks(),
  ]);

  const idx = problems.findIndex(p => p.id === id);
  const prevId = idx > 0 ? problems[idx - 1].id : null;
  const nextId = idx < problems.length - 1 ? problems[idx + 1].id : null;

  after(() => {
    console.log(`[page] Problem viewed: ${id} (${problem.title})`);
  });

  return (
    <Suspense fallback={<Loading />}>
      {preloadChunks.map(href => (
        <link key={href} rel="modulepreload" href={href} as="script" />
      ))}
      {/* Warm the HTTP cache before useHealthCheck (in StatusBar) fires its
          first /api/health request post-hydration. */}
      <link rel="preload" as="fetch" href="/api/health" crossOrigin="anonymous" />
      <ProblemWorkspace
        problem={problem}
        prevId={prevId}
        nextId={nextId}
        healthWarnings={health.warnings}
        markdownHtml={markdownHtml}
      />
    </Suspense>
  );
}
