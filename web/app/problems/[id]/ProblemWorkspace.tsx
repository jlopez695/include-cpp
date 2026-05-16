'use client';

import { lazy, Suspense, useRef, useState, useEffect } from 'react';
import type { ProblemDetail } from '@/lib/types';
import { useProblemEditor } from '@/hooks/useProblemEditor';
import { useResizable } from '@/hooks/useResizable';
import { loadUiState, saveUiState } from '@/lib/storage';
import { TopBar } from '@/components/TopBar';
import { ProblemDescription } from '@/components/ProblemDescription';
import { EditorPanel } from '@/components/EditorPanel';
import { StatusBar } from '@/components/StatusBar';
import { HealthBanner } from '@/components/HealthBanner';

const KeyboardShortcuts = lazy(() => import('@/components/KeyboardShortcuts').then(m => ({ default: m.KeyboardShortcuts })));

interface Props {
  problem: ProblemDetail;
  prevId: string | null;
  nextId: string | null;
  healthWarnings: string[];
  markdownHtml: string;
}

export function ProblemWorkspace({ problem, prevId, nextId, healthWarnings, markdownHtml }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const editor = useProblemEditor(problem);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [vimMode, setVimMode] = useState(false);

  useEffect(() => {
    setVimMode(loadUiState('vimMode', false));
  }, []);

  const toggleVim = () => {
    setVimMode(prev => {
      const next = !prev;
      saveUiState('vimMode', next);
      return next;
    });
  };

  const horizontal = useResizable(
    'split-h',
    38,
    'horizontal',
    () => bodyRef.current,
    [20, 70],
  );

  const toggleShortcuts = () => setShowShortcuts(v => !v);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '?') {
        e.preventDefault();
        toggleShortcuts();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleShortcuts]);

  return (
    <>
      <a href="#editor-panel" className="skip-link">Skip to editor</a>
      <HealthBanner warnings={healthWarnings} />
      <TopBar problem={problem} prevId={prevId} nextId={nextId} status={editor.status} />

      <div className="flex-1 flex overflow-hidden min-h-0" ref={bodyRef}>
        <section
          className="flex flex-col border-r border-border-soft overflow-hidden bg-bg-1 min-w-[240px]"
          style={{ width: `${horizontal.size}%` }}
        >
          <ProblemDescription html={markdownHtml} />
        </section>

        <div
          onMouseDown={horizontal.onMouseDown}
          className="w-1.5 cursor-col-resize shrink-0 relative z-10 hover:bg-accent/30 active:bg-accent/40 transition-colors"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize description panel"
          tabIndex={0}
        />

        <EditorPanel editor={editor} vimMode={vimMode} onVimToggle={toggleVim} />
      </div>

      <StatusBar
        activeFile={editor.activeFile}
        isEditable={editor.isActiveEditable}
        cursorLine={editor.cursorLine}
        cursorCol={editor.cursorCol}
        onShowShortcuts={toggleShortcuts}
      />

      <Suspense fallback={null}>
        <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      </Suspense>
    </>
  );
}
