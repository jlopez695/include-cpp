'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import type { ProblemSummary } from '@/lib/types';
import { loadUiState, saveUiState } from '@/lib/storage';

interface Props {
  problems: ProblemSummary[];
}

export function SidebarWrapper({ problems }: Props) {
  const params = useParams<{ id?: string }>();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(loadUiState('sidebarCollapsed', false));
  }, []);

  // Cmd+B to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setCollapsed(prev => {
          const next = !prev;
          saveUiState('sidebarCollapsed', next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      saveUiState('sidebarCollapsed', next);
      return next;
    });
  };

  if (collapsed) {
    return (
      <aside className="w-10 min-w-10 bg-bg-1 border-r border-border-soft flex flex-col items-center py-3 shrink-0">
        <button
          onClick={toggleCollapse}
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent via-purple to-accent text-bg-0 flex items-center justify-center font-extrabold text-[9px] tracking-wider shrink-0 shadow-sm shadow-accent/20 hover:brightness-110 transition-all"
          title="Expand sidebar (Cmd+B)"
          aria-label="Expand sidebar"
        >
          225
        </button>
        <div className="flex-1" />
        <button
          onClick={toggleCollapse}
          className="w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-text-bright transition-colors"
          aria-label="Expand sidebar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <Sidebar
      problems={problems}
      activeId={params.id ?? ''}
      onCollapse={toggleCollapse}
    />
  );
}
