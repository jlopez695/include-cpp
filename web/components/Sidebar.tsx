'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ProblemSummary, Status } from '@/lib/types';
import { loadStatus } from '@/lib/storage';

function StatusDot({ status }: { status: Status }) {
  const cls =
    status === 'solved'
      ? 'bg-good border-good'
      : status === 'attempted'
        ? 'bg-warn border-warn'
        : 'bg-transparent border-text-mute';
  return (
    <span
      className={`w-2 h-2 rounded-full border-[1.5px] shrink-0 ${cls}`}
      role="img"
      aria-label={status}
    />
  );
}

interface SidebarProps {
  problems: ProblemSummary[];
  activeId: string;
  /** Called from parent to force status refresh (optimistic updates) */
  statusOverrides?: Record<string, Status>;
}

export function Sidebar({ problems, activeId, statusOverrides }: SidebarProps) {
  const [search, setSearch] = useState('');

  const statuses = useMemo(() => {
    const s: Record<string, Status> = {};
    for (const p of problems) {
      s[p.id] = statusOverrides?.[p.id] ?? loadStatus(p.id);
    }
    return s;
  }, [problems, statusOverrides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return problems;
    return problems.filter(
      p => p.id.toLowerCase().includes(q) || p.title.toLowerCase().includes(q),
    );
  }, [problems, search]);

  const solvedCount = Object.values(statuses).filter(s => s === 'solved').length;

  return (
    <aside
      className="w-60 min-w-60 bg-bg-1 border-r border-border-soft flex flex-col overflow-hidden"
      role="navigation"
      aria-label="Problem list"
    >
      {/* Brand */}
      <div className="p-4 border-b border-border-soft shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-purple text-bg-0 flex items-center justify-center font-extrabold text-xs tracking-wider shrink-0">
            225
          </div>
          <div className="flex flex-col min-w-0">
            <div className="text-[13px] font-bold text-text-bright">CS 225 POTD</div>
            <div className="text-[11px] text-text-dim mt-px">
              {solvedCount} of {problems.length} solved
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border-soft">
        <label className="sr-only" htmlFor="problem-search">
          Search problems
        </label>
        <input
          id="problem-search"
          type="text"
          placeholder="Search problems..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-bg-2 border border-border-soft text-text-base placeholder:text-text-mute px-2.5 py-1.5 rounded-md text-xs outline-none focus:border-accent-dim focus:bg-bg-3 transition"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1.5" role="list">
        {filtered.length === 0 && (
          <div className="px-3.5 py-4 text-text-mute text-xs italic" role="status">
            No matching problems
          </div>
        )}
        {filtered.map(p => (
          <Link
            key={p.id}
            href={`/problems/${p.id}`}
            role="listitem"
            className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-left border-l-2 transition-colors hover:bg-white/[0.03] no-underline ${
              activeId === p.id
                ? 'bg-accent/[0.08] border-l-accent'
                : 'border-l-transparent'
            }`}
          >
            <StatusDot status={statuses[p.id] ?? 'unsolved'} />
            <div className="flex flex-col min-w-0 gap-px">
              <div
                className={`text-[10px] font-semibold tracking-wider uppercase ${
                  activeId === p.id ? 'text-accent' : 'text-text-mute'
                }`}
              >
                {p.id}
              </div>
              <div className="text-[13px] leading-tight text-text-base truncate">{p.title}</div>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}
