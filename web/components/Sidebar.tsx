'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProblemSummary, Status } from '@/lib/types';
import { loadStatus, getStreak, getBookmarkedIds, toggleBookmark, loadBestResult, type BestResult } from '@/lib/storage';
import { pickRandom } from '@/lib/random-pick';
import { ProgressDashboard } from './ProgressDashboard';

type Filter = 'all' | 'starred' | Status;

function StatusDot({ status }: { status: Status }) {
  if (status === 'solved') {
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-good/15 flex items-center justify-center shrink-0" role="img" aria-label="solved">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-good" />
        </svg>
      </span>
    );
  }
  if (status === 'attempted') {
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-warn/15 flex items-center justify-center shrink-0" role="img" aria-label="attempted">
        <span className="w-1.5 h-1.5 rounded-full bg-warn" />
      </span>
    );
  }
  return (
    <span className="w-[18px] h-[18px] rounded-full border border-border-strong flex items-center justify-center shrink-0" role="img" aria-label="unsolved">
      <span className="w-1 h-1 rounded-full bg-text-mute/40" />
    </span>
  );
}

interface SidebarProps {
  problems: ProblemSummary[];
  activeId: string;
  statusOverrides?: Record<string, Status>;
  onCollapse?: () => void;
}

export function Sidebar({ problems, activeId, statusOverrides, onCollapse }: SidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showProgress, setShowProgress] = useState(false);

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [bestResults, setBestResults] = useState<Record<string, BestResult>>({});

  // Load statuses, bookmarks, and best results client-side only to avoid hydration mismatch
  useEffect(() => {
    const s: Record<string, Status> = {};
    const b: Record<string, BestResult> = {};
    for (const p of problems) {
      s[p.id] = statusOverrides?.[p.id] ?? loadStatus(p.id);
      const best = loadBestResult(p.id);
      if (best) b[p.id] = best;
    }
    setStatuses(s);
    setBestResults(b);
    setBookmarks(new Set(getBookmarkedIds()));
  }, [problems, statusOverrides]);

  const handleToggleBookmark = (problemId: string) => {
    const nowBookmarked = toggleBookmark(problemId);
    setBookmarks(prev => {
      const next = new Set(prev);
      if (nowBookmarked) next.add(problemId);
      else next.delete(problemId);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return problems.filter(p => {
      if (q && !p.id.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q)) return false;
      if (filter === 'starred' && !bookmarks.has(p.id)) return false;
      else if (filter !== 'all' && filter !== 'starred' && statuses[p.id] !== filter) return false;
      return true;
    });
  }, [problems, search, filter, statuses, bookmarks]);

  const solvedCount = Object.values(statuses).filter(s => s === 'solved').length;
  const attemptedCount = Object.values(statuses).filter(s => s === 'attempted').length;
  const progressPct = problems.length > 0 ? (solvedCount / problems.length) * 100 : 0;

  const FILTERS: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: problems.length },
    { value: 'starred', label: '\u2605', count: bookmarks.size },
    { value: 'unsolved', label: 'Todo', count: problems.length - solvedCount - attemptedCount },
    { value: 'attempted', label: 'WIP', count: attemptedCount },
    { value: 'solved', label: 'Done', count: solvedCount },
  ];

  return (
    <aside
      className="w-60 min-w-60 bg-bg-1 border-r border-border-soft flex flex-col overflow-hidden"
      role="navigation"
      aria-label="Problem list"
    >
      {/* Brand */}
      <div className="p-4 border-b border-border-soft shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent via-purple to-accent text-bg-0 flex items-center justify-center font-extrabold text-sm tracking-wider shrink-0 shadow-lg shadow-accent/20">
            225
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="text-[13px] font-bold text-text-bright tracking-tight">CS 225 POTD</div>
            <button
              onClick={() => setShowProgress(true)}
              className="text-[11px] text-text-dim mt-0.5 hover:text-accent transition-colors text-left"
            >
              {solvedCount} of {problems.length} solved
            </button>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-text-bright hover:bg-bg-3 transition-colors shrink-0"
              title="Collapse sidebar (Cmd+B)"
              aria-label="Collapse sidebar"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-bg-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-good rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progressPct, 2)}%` }}
          />
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border-soft">
        <label className="sr-only" htmlFor="problem-search">
          Search problems
        </label>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="problem-search"
              type="text"
              placeholder="Search problems..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-bg-2 border border-border-soft text-text-base placeholder:text-text-mute pl-8 pr-2.5 py-1.5 rounded-lg text-xs outline-none focus:border-accent-dim focus:bg-bg-3 transition"
            />
          </div>
          <button
            onClick={() => {
              const id = pickRandom(problems, statuses, activeId);
              if (id) router.push(`/problems/${id}`);
            }}
            title="Random problem"
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-mute hover:text-accent hover:bg-accent/10 transition-colors shrink-0"
            aria-label="Pick a random problem"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="5" cy="5" r="0.8" fill="currentColor" />
              <circle cx="9" cy="5" r="0.8" fill="currentColor" />
              <circle cx="7" cy="7" r="0.8" fill="currentColor" />
              <circle cx="5" cy="9" r="0.8" fill="currentColor" />
              <circle cx="9" cy="9" r="0.8" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex px-2 py-1.5 gap-0.5 border-b border-border-soft shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-1 text-[10px] font-medium py-1 rounded-md transition-colors ${
              filter === f.value
                ? 'bg-accent/15 text-accent'
                : 'text-text-mute hover:text-text-dim hover:bg-white/[0.03]'
            }`}
          >
            {f.label}
            <span className="ml-1 opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1" role="list">
        {filtered.length === 0 && (
          <div className="px-3.5 py-6 text-text-mute text-xs text-center" role="status">
            No matching problems
          </div>
        )}
        {filtered.map((p) => {
          const isActive = activeId === p.id;
          const status = statuses[p.id] ?? 'unsolved';
          const starred = bookmarks.has(p.id);
          const best = bestResults[p.id];
          return (
            <div key={p.id} className="relative group" role="listitem">
              <Link
                href={`/problems/${p.id}`}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left border-l-2 transition-all duration-150 hover:bg-white/[0.03] no-underline ${
                  isActive
                    ? 'bg-accent/[0.07] border-l-accent'
                    : 'border-l-transparent'
                }`}
              >
                <StatusDot status={status} />
                <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                  <div
                    className={`text-[10px] font-semibold tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                      isActive ? 'text-accent' : 'text-text-mute group-hover:text-text-dim'
                    }`}
                  >
                    {p.id}
                    {best && status !== 'solved' && (
                      <span className="text-[9px] font-normal text-text-mute/60 tabular-nums">
                        {best.passed}/{best.total}
                      </span>
                    )}
                  </div>
                  <div className={`text-[13px] leading-tight truncate transition-colors ${
                    isActive ? 'text-text-bright' : 'text-text-base'
                  }`}>
                    {p.title}
                  </div>
                </div>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); handleToggleBookmark(p.id); }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded transition-all ${
                  starred
                    ? 'text-warn opacity-100'
                    : 'text-text-mute opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-warn'
                }`}
                aria-label={starred ? 'Remove bookmark' : 'Add bookmark'}
                title={starred ? 'Remove bookmark' : 'Bookmark'}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill={starred ? 'currentColor' : 'none'}>
                  <path d="M5 1L6.1 3.5H8.8L6.8 5.2L7.5 8L5 6.3L2.5 8L3.2 5.2L1.2 3.5H3.9L5 1Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border-soft text-[10px] text-text-mute shrink-0 flex items-center justify-between">
        <span>Data Structures - UIUC</span>
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
  }, []);
  if (streak === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-orange font-semibold" title={`${streak} day streak`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L7.5 5H4.5L6 1Z" fill="currentColor" opacity="0.6" />
        <path d="M6 4L8 8.5C8 10 7.1 11 6 11C4.9 11 4 10 4 8.5L6 4Z" fill="currentColor" />
      </svg>
      {streak}
    </span>
  );
}
