'use client';

import { useRef } from 'react';
import type { ProblemDetail, ProblemSummary } from '@/lib/types';
import { useProblemEditor } from '@/hooks/useProblemEditor';
import { useResizable } from '@/hooks/useResizable';
import { TopBar } from '@/components/TopBar';
import { ProblemDescription } from '@/components/ProblemDescription';
import { EditorPanel } from '@/components/EditorPanel';
import { StatusBar } from '@/components/StatusBar';
import { HealthBanner } from '@/components/HealthBanner';
import { Confetti } from '@/components/Confetti';
import { langForFile } from '@/lib/lang';

interface Props {
  problem: ProblemDetail;
  problems: ProblemSummary[];
}

export function ProblemWorkspace({ problem, problems }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const editor = useProblemEditor(problem);

  const horizontal = useResizable(
    'split-h',
    38,
    'horizontal',
    () => bodyRef.current,
    [20, 70],
  );

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
          <div className="px-[18px] py-[9px] text-[10px] font-bold tracking-[1.4px] uppercase text-text-mute border-b border-border-soft bg-bg-1 shrink-0">
            Problem
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
        <EditorPanel editor={editor} />
      </div>

      <StatusBar
        activeFile={editor.activeFile}
        language={langForFile(editor.activeFile)}
        isEditable={editor.isActiveEditable}
        cursorLine={editor.cursorLine}
        cursorCol={editor.cursorCol}
        compiling={editor.compiling}
      />

      {editor.showConfetti && <Confetti onDone={editor.dismissConfetti} />}
    </>
  );
}
