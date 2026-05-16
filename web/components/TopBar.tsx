'use client';

import Link from 'next/link';
import type { ProblemDetail, Status } from '@/lib/types';
import { StatusDot } from './StatusDot';

interface TopBarProps {
  problem: ProblemDetail;
  prevId: string | null;
  nextId: string | null;
  status: Status;
}

/**
 * Editor-native top bar: prev/next, then "POTD0  Hello World".
 *
 * Earlier versions packed an eyebrow chip + title + total-progress pill +
 * per-problem status badge + build-type pill into the right cluster — the
 * solved status was visible in three places at once. The Sidebar list dot,
 * the OutputPanel summary, and the footer count cover everything that was
 * here, so the bar is now just navigation + identity.
 */
export function TopBar({ problem, prevId, nextId, status }: TopBarProps) {
  return (
    <header className="h-14 flex items-center px-4 gap-3 bg-bg-1 border-b border-border-soft shrink-0">
      <div className="flex items-center gap-0.5 shrink-0">
        <NavArrow href={prevId} dir="prev" />
        <NavArrow href={nextId} dir="next" />
      </div>
      {/* Status dot reuses the Sidebar's vocabulary so the topbar isn't
          inventing a separate visual language for the same information.
          Slightly larger here (10px) to match the bigger title weight. */}
      <StatusDot status={status} size="w-2.5 h-2.5" />
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-text-mute font-mono text-[13px] tabular-nums">{problem.id}</span>
        <h1 className="text-[20px] font-semibold text-text-bright tracking-[-0.01em] truncate">
          {problem.title}
        </h1>
      </div>
    </header>
  );
}

function NavArrow({ href, dir }: { href: string | null; dir: 'prev' | 'next' }) {
  const path = dir === 'prev'
    ? 'M8.5 3.5L5 7L8.5 10.5'
    : 'M5.5 3.5L9 7L5.5 10.5';
  const label = dir === 'prev' ? 'Previous problem' : 'Next problem';

  if (!href) {
    return (
      <span
        className="w-7 h-7 flex items-center justify-center text-text-mute opacity-30 cursor-default"
        aria-label={`No ${dir === 'prev' ? 'previous' : 'next'} problem`}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d={path} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <Link
      href={`/problems/${href}`}
      prefetch
      title={label}
      className="hit-area w-7 h-7 flex items-center justify-center text-text-mute hover:text-text-bright transition-colors"
      aria-label={label}
    >
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
        <path d={path} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
