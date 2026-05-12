'use client';

import { useRef, useState, useEffect } from 'react';
import type { ProblemDetail, ProblemSummary } from '@/lib/types';
import { useProblemEditor } from '@/hooks/useProblemEditor';
import { useResizable } from '@/hooks/useResizable';
import { loadUiState, saveUiState } from '@/lib/storage';
import { TopBar } from '@/components/TopBar';
import { ProblemDescription } from '@/components/ProblemDescription';
import { EditorPanel } from '@/components/EditorPanel';
import { StatusBar } from '@/components/StatusBar';
import { HealthBanner } from '@/components/HealthBanner';
import { Confetti } from '@/components/Confetti';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { langForFile } from '@/lib/lang';

interface Props {
  problem: ProblemDetail;
  problems: ProblemSummary[];
}

export function ProblemWorkspace({ problem, problems }: Props) {
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

  // Global Cmd+? to open shortcuts overlay
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
      <HealthBanner />
      <TopBar problem={problem} problems={problems} status={editor.status} />

      {/* Body: description | resizer | editor */}
      <div className="flex-1 flex overflow-hidden min-h-0" ref={bodyRef}>
        {/* Description panel */}
        <section
          className="flex flex-col border-r border-border-soft overflow-hidden bg-bg-1 min-w-[240px]"
          style={{ width: `${horizontal.size}%` }}
        >
          <div className="px-[18px] py-[9px] text-[10px] font-bold tracking-[1.4px] uppercase border-b border-border-soft bg-bg-1 shrink-0 flex items-center gap-1.5">
            <span className="text-text-mute">Problems</span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-text-mute/50">
              <path d="M3 2L5 4L3 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
            <span className="text-accent">{problem.id}</span>
          </div>
          <ProblemDescription markdown={problem.markdown} />
        </section>

        {/* Horizontal resizer */}
        <div
          onMouseDown={horizontal.onMouseDown}
          className="resizer-grip-h w-1.5 cursor-col-resize shrink-0 relative z-10 hover:bg-accent/20 active:bg-accent/30 transition-colors"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize description panel"
          tabIndex={0}
        />

        {/* Editor panel */}
        <EditorPanel editor={editor} vimMode={vimMode} onVimToggle={toggleVim} />
      </div>

      <StatusBar
        activeFile={editor.activeFile}
        language={langForFile(editor.activeFile)}
        isEditable={editor.isActiveEditable}
        cursorLine={editor.cursorLine}
        cursorCol={editor.cursorCol}
        compiling={editor.compiling}
        vimMode={vimMode}
      />

      {editor.showConfetti && <Confetti onDone={editor.dismissConfetti} />}
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
  );
}
