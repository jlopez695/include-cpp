'use client';

import { useEffect } from 'react';
import type { ProblemSummary, Status } from '@/lib/types';
import { loadStatus } from '@/lib/storage';

interface ProgressDashboardProps {
  open: boolean;
  onClose: () => void;
  problems: ProblemSummary[];
}

export function ProgressDashboard({ open, onClose, problems }: ProgressDashboardProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const statuses: Record<string, Status> = {};
  for (const p of problems) {
    statuses[p.id] = loadStatus(p.id);
  }
  const solved = Object.values(statuses).filter(s => s === 'solved').length;
  const attempted = Object.values(statuses).filter(s => s === 'attempted').length;
  const unsolved = problems.length - solved - attempted;
  const stats = { solved, attempted, unsolved, total: problems.length, statuses };

  if (!open) return null;

  const pct = stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-bg-1 border border-border-soft rounded-xl shadow-2xl w-[420px] animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-soft">
          <h2 className="text-[13px] font-semibold text-text-bright">Progress</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-text-dim hover:text-text-bright hover:bg-bg-3 transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {/* Big percentage */}
          <div className="flex items-center justify-center mb-5">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-bg-3)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="16" fill="none"
                  stroke="var(--color-good)" strokeWidth="3"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-text-bright tabular-nums">{pct}%</span>
                <span className="text-[10px] text-text-mute">complete</span>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatCard label="Solved" value={stats.solved} color="text-good" bg="bg-good/10" />
            <StatCard label="Attempted" value={stats.attempted} color="text-warn" bg="bg-warn/10" />
            <StatCard label="Unsolved" value={stats.unsolved} color="text-text-dim" bg="bg-bg-3" />
          </div>

          {/* Progress bar */}
          <div className="h-3 bg-bg-3 rounded-full overflow-hidden flex">
            {stats.solved > 0 && (
              <div
                className="h-full bg-good transition-all duration-500"
                style={{ width: `${(stats.solved / stats.total) * 100}%` }}
              />
            )}
            {stats.attempted > 0 && (
              <div
                className="h-full bg-warn transition-all duration-500"
                style={{ width: `${(stats.attempted / stats.total) * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-text-mute">
            <span>{stats.solved} solved</span>
            <span>{stats.total} total</span>
          </div>
        </div>

        <div className="px-5 py-2.5 border-t border-border-soft">
          <span className="text-[10px] text-text-mute">Press <kbd>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`flex flex-col items-center py-3 rounded-lg ${bg}`}>
      <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-text-mute mt-0.5">{label}</span>
    </div>
  );
}
