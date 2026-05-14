'use client';

import Link from 'next/link';
import type { ProblemDetail, Status } from '@/lib/types';

interface TopBarProps {
  problem: ProblemDetail;
  prevId: string | null;
  nextId: string | null;
  status: Status;
}

export function TopBar({ problem, prevId, nextId, status }: TopBarProps) {
  return (
    <header className="h-12 flex items-center justify-between px-5 bg-bg-1 border-b border-border-soft shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Prev/Next nav */}
        <div className="flex items-center gap-0.5 shrink-0">
          {prevId ? (
            <Link
              href={`/problems/${prevId}`}
              prefetch={true}
              title="Previous problem"
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-dim hover:text-text-bright hover:bg-bg-3 transition-colors"
              aria-label="Previous problem"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M8.5 3.5L5 7L8.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : (
            <span className="w-7 h-7 flex items-center justify-center rounded-md text-text-dim opacity-25 cursor-default" aria-label="No previous problem">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M8.5 3.5L5 7L8.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          {nextId ? (
            <Link
              href={`/problems/${nextId}`}
              prefetch={true}
              title="Next problem"
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-dim hover:text-text-bright hover:bg-bg-3 transition-colors"
              aria-label="Next problem"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 3.5L9 7L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : (
            <span className="w-7 h-7 flex items-center justify-center rounded-md text-text-dim opacity-25 cursor-default" aria-label="No next problem">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 3.5L9 7L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>

        <span className="text-[11px] font-bold tracking-widest text-accent uppercase bg-accent/10 px-2.5 py-1 rounded-md">
          {problem.id}
        </span>
        <h1 className="text-[14px] font-semibold text-text-bright truncate tracking-tight">
          {problem.title}
        </h1>
      </div>
      <div className="flex items-center gap-2.5">
        <StatusBadge status={status} />
        <span className="text-[10px] font-medium tracking-wider uppercase px-2 py-1 rounded-md bg-bg-3/80 text-text-dim border border-border-soft">
          {problem.buildType}
        </span>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'solved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full text-good bg-good/10 border border-good/20 animate-pop-in">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3.5 6.2L5.2 7.8L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Solved
      </span>
    );
  }
  if (status === 'attempted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full text-warn bg-warn/10 border border-warn/20">
        <span className="w-1.5 h-1.5 rounded-full bg-warn" />
        Attempted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full text-text-dim bg-bg-3/80 border border-border-soft">
      <span className="w-1.5 h-1.5 rounded-full bg-text-mute/50" />
      Unsolved
    </span>
  );
}
