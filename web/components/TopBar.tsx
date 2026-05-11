'use client';

import type { ProblemDetail, Status } from '@/lib/types';

interface TopBarProps {
  problem: ProblemDetail;
  status: Status;
}

export function TopBar({ problem, status }: TopBarProps) {
  return (
    <header className="h-11 flex items-center justify-between px-[18px] bg-bg-1 border-b border-border-soft shrink-0">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-[11px] font-bold tracking-wider text-accent uppercase">
          {problem.id}
        </span>
        <h1 className="text-sm font-semibold text-text-bright truncate">{problem.title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border tracking-[0.3px] ${
            status === 'solved'
              ? 'text-good bg-good/10 border-good/25'
              : status === 'attempted'
                ? 'text-warn bg-warn/10 border-warn/25'
                : 'text-text-dim bg-bg-3 border-border-soft'
          }`}
          role="status"
          aria-label={`Problem status: ${status}`}
        >
          {status === 'solved' && '\u2713 Solved'}
          {status === 'attempted' && '\u25D0 Attempted'}
          {status === 'unsolved' && '\u25CB Unsolved'}
        </span>
        <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-bg-3 text-text-dim border border-border-soft">
          {problem.buildType}
        </span>
      </div>
    </header>
  );
}
