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
      <aside className="w-10 min-w-10 bg-bg-1 border-r border-border-soft flex flex-col items-center shrink-0">
        <button
          onClick={toggleCollapse}
          className="hit-area-lg w-10 h-14 flex items-center justify-center text-text-mute hover:text-text-bright transition-colors"
          title="Expand sidebar (Cmd+B)"
          aria-label="Expand sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4H12M2 7H12M2 10H12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
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
