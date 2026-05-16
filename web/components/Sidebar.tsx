'use client';

import { useState, useEffect, useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProblemSummary, Status } from '@/lib/types';
import {
  loadStatus,
  getStreak,
  getBookmarkedIds,
  toggleBookmark,
  STATUS_CHANGE_EVENT,
  STREAK_CHANGE_EVENT,
  type StatusChangeDetail,
} from '@/lib/storage';
import { pickRandom } from '@/lib/random-pick';
import { ProgressDashboard } from './ProgressDashboard';
import { StatusDot } from './StatusDot';

interface SidebarProps {
  problems: ProblemSummary[];
  activeId: string;
  statusOverrides?: Record<string, Status>;
  onCollapse?: () => void;
}

export function Sidebar({ problems, activeId, statusOverrides, onCollapse }: SidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showProgress, setShowProgress] = useState(false);

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const s: Record<string, Status> = {};
    for (const p of problems) {
      s[p.id] = statusOverrides?.[p.id] ?? loadStatus(p.id);
    }
    setStatuses(s);
    setBookmarks(new Set(getBookmarkedIds()));
  }, [problems, statusOverrides]);

  // Refresh the row whose status just changed. saveStatus dispatches the
  // event from the same tab that solved the problem (the browser's native
  // `storage` event only fires across tabs). Without this listener,
  // solving the currently-active problem leaves its sidebar dot showing
  // the old status until a full page reload.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StatusChangeDetail>).detail;
      if (!detail) return;
      // Don't refresh a row whose status is being driven by the parent
      // (statusOverrides wins over localStorage).
      if (statusOverrides && detail.problemId in statusOverrides) return;
      setStatuses(prev =>
        prev[detail.problemId] === detail.status
          ? prev
          : { ...prev, [detail.problemId]: detail.status },
      );
    };
    window.addEventListener(STATUS_CHANGE_EVENT, handler);
    return () => window.removeEventListener(STATUS_CHANGE_EVENT, handler);
  }, [statusOverrides]);

  const [optimisticBookmarks, addOptimisticBookmark] = useOptimistic(
    bookmarks,
    (current: Set<string>, problemId: string) => {
      const next = new Set(current);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    },
  );
  const [, startTransition] = useTransition();

  const handleToggleBookmark = (problemId: string) => {
    startTransition(async () => {
      addOptimisticBookmark(problemId);
      const nowBookmarked = toggleBookmark(problemId);
      setBookmarks(prev => {
        const next = new Set(prev);
        if (nowBookmarked) next.add(problemId);
        else next.delete(problemId);
        return next;
      });
    });
  };

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return problems;
    return problems.filter(p =>
      p.id.toLowerCase().includes(q) || p.title.toLowerCase().includes(q),
    );
  })();

  const solvedCount = Object.values(statuses).filter(s => s === 'solved').length;

  return (
    <aside
      className="w-60 min-w-60 bg-bg-1 border-r border-border-soft flex flex-col overflow-hidden"
      role="navigation"
      aria-label="Problem list"
    >
      {/* Brand — display weight wordmark with a vertical accent bar as the
          visual identifier (Vercel-style). The bar lives independent of the
          button so it never moves with hover. */}
      <div className="h-14 flex items-center justify-between pl-4 pr-2 shrink-0 border-b border-border-soft/60">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 bg-accent rounded-sm" aria-hidden="true" />
          <button
            onClick={() => setShowProgress(true)}
            className="text-[18px] font-semibold text-text-bright tracking-[-0.01em] hover:opacity-80 transition-opacity"
            aria-label="CS 225 — open progress"
          >
            CS 225
          </button>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="hit-area-lg w-7 h-7 flex items-center justify-center text-text-mute hover:text-text-bright transition-colors"
            title="Collapse sidebar (Cmd+B)"
            aria-label="Collapse sidebar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Search — wrapped as a real input shell so it reads as something
          you can type in, not bare text on a panel. */}
      <div className="px-3 py-3 shrink-0">
        <div className="flex items-center gap-2 bg-bg-2 border border-border-soft/60 rounded-md px-3 py-1.5 focus-within:border-accent/50 transition-colors">
          <label className="sr-only" htmlFor="problem-search">Search problems</label>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-mute shrink-0">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.25" />
            <path d="M7.7 7.7L10 10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <input
            id="problem-search"
            type="text"
            placeholder="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-text-base placeholder:text-text-mute text-[13px] outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="hit-area w-4 h-4 flex items-center justify-center text-text-mute hover:text-text-base"
              aria-label="Clear search"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              const id = pickRandom(problems, statuses, activeId);
              if (id) router.push(`/problems/${id}`);
            }}
            title="Random problem"
            className="hit-area w-4 h-4 flex items-center justify-center text-text-mute hover:text-accent transition-colors shrink-0"
            aria-label="Pick a random problem"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
              <circle cx="4" cy="4" r="0.7" fill="currentColor" />
              <circle cx="8" cy="8" r="0.7" fill="currentColor" />
              <circle cx="6" cy="6" r="0.7" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* List — rows are contained "cards" with mx-2 horizontal breathing
          room. Active highlight forms a rounded shape inside that envelope
          (not edge-to-edge tinted bar), with an inset accent rail via
          box-shadow so the rail lives inside the rounded corners. */}
      <div className="flex-1 overflow-y-auto py-1" role="list">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-text-mute text-[12px] text-center" role="status">
            No matching problems
          </div>
        )}
        {filtered.map((p) => {
          const isActive = activeId === p.id;
          const status = statuses[p.id] ?? 'unsolved';
          const starred = optimisticBookmarks.has(p.id);
          return (
            <div key={p.id} className="relative group mx-2" role="listitem">
              <Link
                href={`/problems/${p.id}`}
                className={`flex items-center gap-2.5 w-full pr-9 py-2.5 pl-3 rounded-md text-left transition-colors no-underline ${
                  isActive
                    ? 'bg-accent/[0.10] text-text-bright font-medium elevation-1'
                    : 'text-text-base hover:bg-white/[0.04]'
                }`}
                style={isActive ? { boxShadow: 'inset 2px 0 0 var(--color-accent), inset 0 1px 0 rgba(255,255,255,0.06)' } : undefined}
              >
                <StatusDot status={status} />
                <span className="text-text-mute font-mono text-[11px] tabular-nums w-12 shrink-0">{p.id}</span>
                <span className="text-[14px] truncate flex-1">{p.title}</span>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); handleToggleBookmark(p.id); }}
                /* Star is always visible — subtle mute/50 by default so the
                   bookmark column reads as a column, brighter on hover, full
                   amber when starred. */
                className={`hit-area-lg absolute right-2 top-1/2 -translate-y-1/2 w-[18px] h-[18px] flex items-center justify-center transition-colors ${
                  starred
                    ? 'text-warn'
                    : 'text-text-mute/50 group-hover:text-text-base'
                }`}
                aria-label={starred ? 'Remove bookmark' : 'Add bookmark'}
                title={starred ? 'Remove bookmark' : 'Bookmark'}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill={starred ? 'currentColor' : 'none'}>
                  <path d="M7 1.4L8.65 4.95H12.5L9.45 7.25L10.55 11L7 8.85L3.45 11L4.55 7.25L1.5 4.95H5.35L7 1.4Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer — total progress + optional streak */}
      <div className="px-4 h-10 border-t border-border-soft/60 flex items-center justify-between shrink-0 text-[11px] text-text-mute">
        <span className="tabular-nums">{solvedCount} / {problems.length} solved</span>
        <StreakBadge />
      </div>

      <ProgressDashboard
        open={showProgress}
        onClose={() => setShowProgress(false)}
        problems={problems}
      />
    </aside>
  );
}

function StreakBadge() {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    setStreak(getStreak());
    // recordSolveDate dispatches STREAK_CHANGE_EVENT when a NEW solve date
    // lands. Re-read getStreak() so the badge ticks up the moment the user
    // crosses midnight into a new solve day, without a page reload.
    const handler = () => setStreak(getStreak());
    window.addEventListener(STREAK_CHANGE_EVENT, handler);
    return () => window.removeEventListener(STREAK_CHANGE_EVENT, handler);
  }, []);
  if (streak === 0) return null;
  return (
    <span className="text-text-mute tabular-nums" title={`${streak} day streak`}>
      {streak}d streak
    </span>
  );
}
