'use client';

import type { ProblemSummary, Status } from '@/lib/types';
import { loadStatus } from '@/lib/storage';
import { Modal } from './Modal';

interface ProgressDashboardProps {
  open: boolean;
  onClose: () => void;
  problems: ProblemSummary[];
}

export function ProgressDashboard({ open, onClose, problems }: ProgressDashboardProps) {
  if (!open) return null;

  const statuses: Record<string, Status> = {};
  for (const p of problems) {
    statuses[p.id] = loadStatus(p.id);
  }
  const solved = Object.values(statuses).filter(s => s === 'solved').length;
  const attempted = Object.values(statuses).filter(s => s === 'attempted').length;
  const unsolved = problems.length - solved - attempted;

  return (
    <Modal open={open} onClose={onClose} title="Progress" width={380}>
      <div className="px-5 py-6">
        <div className="text-[28px] font-semibold text-text-bright tabular-nums leading-none tracking-[-0.02em]">
          {solved} <span className="text-text-mute font-medium">/ {problems.length}</span>
        </div>
        <div className="text-[13px] text-text-dim mt-3">
          {solved} solved · {attempted} attempted · {unsolved} unsolved
        </div>
      </div>
    </Modal>
  );
}
