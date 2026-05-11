'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ProblemSummary, Status } from '@/lib/types';
import { loadStatus } from '@/lib/storage';

type Filter = 'all' | Status;

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
}

export function Sidebar({ problems, activeId, statusOverrides }: SidebarProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const statuses = useMemo(() => {
    const s: Record<string, Status> = {};
    for (const p of problems) {
      s[p.id] = statusOverrides?.[p.id] ?? loadStatus(p.id);
    }
    return s;
  }, [problems, statusOverrides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return problems.filter(p => {
      if (q && !p.id.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q)) return false;
      if (filter !== 'all' && statuses[p.id] !== filter) return false;
      return true;
    });
  }, [problems, search, filter, statuses]);

  const solvedCount = Object.values(statuses).filter(s => s === 'solved').length;
  const attemptedCount = Object.values(statuses).filter(s => s === 'attempted').length;
  const progressPct = problems.length > 0 ? (solvedCount / problems.length) * 100 : 0;

  const FILTERS: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: problems.length },
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
          <div className="flex flex-col min-w-0">
            <div className="text-[13px] font-bold text-text-bright tracking-tight">CS 225 POTD</div>
            <div className="text-[11px] text-text-dim mt-0.5">
              {solvedCount} of {problems.length} solved
            </div>
          </div>
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
        <div className="relative">
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
          return (
            <Link
              key={p.id}
              href={`/problems/${p.id}`}
              role="listitem"
              className={`group flex items-center gap-2.5 w-full px-3 py-2.5 text-left border-l-2 transition-all duration-150 hover:bg-white/[0.03] no-underline ${
                isActive
                  ? 'bg-accent/[0.07] border-l-accent'
                  : 'border-l-transparent'
              }`}
            >
              <StatusDot status={status} />
              <div className="flex flex-col min-w-0 gap-0.5">
                <div
                  className={`text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                    isActive ? 'text-accent' : 'text-text-mute group-hover:text-text-dim'
                  }`}
                >
                  {p.id}
                </div>
                <div className={`text-[13px] leading-tight truncate transition-colors ${
                  isActive ? 'text-text-bright' : 'text-text-base'
                }`}>
                  {p.title}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border-soft text-[10px] text-text-mute shrink-0">
        Data Structures - UIUC
      </div>
    </aside>
  );
}
