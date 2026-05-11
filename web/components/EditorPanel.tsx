'use client';

import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { ProblemEditorState } from '@/hooks/useProblemEditor';
import { useResizable } from '@/hooks/useResizable';
import { OutputPanel } from './OutputPanel';

interface EditorPanelProps {
  editor: ProblemEditorState;
}

function FileIcon({ editable }: { editable: boolean }) {
  if (editable) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-accent/70 shrink-0">
        <path d="M3 1.5H7L9.5 4V10.5H3V1.5Z" stroke="currentColor" strokeWidth="1" />
        <path d="M7 1.5V4H9.5" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-mute shrink-0">
      <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1" />
      <path d="M4.5 4V3C4.5 2.17 5.17 1.5 6 1.5C6.83 1.5 7.5 2.17 7.5 3V4" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin text-accent">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      <path d="M12.5 7A5.5 5.5 0 0 0 7 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EditorPanel({ editor }: EditorPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const monacoInstanceRef = useRef<any>(null);

  const outputResize = useResizable(
    'output-height',
    220,
    'vertical',
    () => panelRef.current,
    [80, 600],
  );

  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      monacoInstanceRef.current = monaco;
      editor.models.init(editorInstance, monaco);
      editor.loadIntoModels();

      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => editor.run('run'),
      );
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => editor.run('test'),
      );

      editorInstance.onDidChangeCursorPosition(
        (e: { position: { lineNumber: number; column: number } }) => {
          editor.setCursor(e.position.lineNumber, e.position.column);
        },
      );

      editorInstance.onDidChangeModelContent(() => {
        const model = editorInstance.getModel();
        if (model) {
          const filename = model.uri.path.replace(/^\//, '');
          if (editor.editableNames.includes(filename)) {
            editor.onContentChange(filename, model.getValue());
          }
        }
      });
    },
    [editor],
  );

  return (
    <section
      ref={panelRef}
      className="flex-1 flex flex-col overflow-hidden min-w-0 bg-bg-0"
    >
      {/* File tabs */}
      <div
        className="h-[36px] flex bg-bg-1 border-b border-border-soft overflow-x-auto shrink-0"
        role="tablist"
        aria-label="File tabs"
      >
        {editor.allFiles.map(({ name, editable }) => {
          const isActive = editor.activeFile === name;
          const isModified = editor.modifiedFiles.has(name);
          return (
            <button
              key={name}
              onClick={() => editor.setActiveFile(name)}
              role="tab"
              aria-selected={isActive}
              aria-label={`${name}${!editable ? ' (read only)' : ''}${isModified ? ' (modified)' : ''}`}
              className={`group relative flex items-center gap-1.5 px-3.5 h-full border-r border-border-soft font-mono text-[12px] whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-bg-0 text-text-bright'
                  : 'text-text-dim hover:text-text-base hover:bg-white/[0.02]'
              }`}
            >
              {isActive && (
                <span className={`absolute top-0 left-0 right-0 h-[2px] ${
                  editable ? 'bg-accent' : 'bg-text-mute/50'
                }`} />
              )}
              <FileIcon editable={editable} />
              <span>{name}</span>
              {isModified && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" title="Modified" />
              )}
              {!editable && isActive && (
                <span className="text-[9px] text-text-mute/60 uppercase tracking-wider ml-1">ro</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Monaco editor */}
      <div className="flex-1 relative overflow-hidden min-h-0 bg-[#1e1e1e]">
        <Editor
          defaultLanguage="cpp"
          theme="vs-dark"
          onMount={handleEditorMount}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            readOnly: !editor.isActiveEditable,
            renderLineHighlight: editor.isActiveEditable ? 'line' : 'none',
            lineNumbers: 'on',
            wordWrap: 'off',
            tabSize: 2,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            padding: { top: 12, bottom: 12 },
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
          }}
        />
        {!editor.isActiveEditable && (
          <div className="absolute top-3 right-4 bg-bg-3/80 backdrop-blur-sm text-text-dim text-[10px] px-3 py-1 rounded-full pointer-events-none z-10 tracking-wider uppercase border border-border-soft/50 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1" />
              <path d="M4.5 4V3C4.5 2.17 5.17 1.5 6 1.5C6.83 1.5 7.5 2.17 7.5 3V4" stroke="currentColor" strokeWidth="1" />
            </svg>
            Read Only
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="h-12 flex items-center gap-2 px-4 bg-bg-1 border-t border-border-soft shrink-0">
        {!editor.running ? (
          <>
            <button
              onClick={() => editor.run('run')}
              className="inline-flex items-center gap-1.5 px-4 py-[7px] rounded-lg text-[12px] font-semibold bg-accent text-bg-0 hover:brightness-110 active:translate-y-px transition-all shadow-sm shadow-accent/20"
              aria-label="Run program (Cmd+Enter)"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="1,0 10,5 1,10" />
              </svg>
              Run
              <kbd className="border-none bg-black/20 shadow-none opacity-60">{'\u2318\u21B5'}</kbd>
            </button>
            <button
              onClick={() => editor.run('test')}
              className="inline-flex items-center gap-1.5 px-4 py-[7px] rounded-lg text-[12px] font-semibold bg-good text-bg-0 hover:brightness-110 active:translate-y-px transition-all shadow-sm shadow-good/20"
              aria-label="Run tests (Cmd+Shift+Enter)"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 5.5L4 7.5L8 3" />
              </svg>
              Test
              <kbd className="border-none bg-black/20 shadow-none opacity-60">{'\u2318\u21E7\u21B5'}</kbd>
            </button>
            <button
              onClick={editor.reset}
              title="Restore starter code"
              className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[12px] font-medium text-text-dim border border-border-soft hover:bg-bg-2 hover:text-text-base hover:border-border-strong active:translate-y-px transition-all"
              aria-label="Reset to starter code"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <path d="M2.5 6.5A4 4 0 1 1 3.5 9.5" />
                <path d="M2 3.5V6.5H5" />
              </svg>
              Reset
            </button>
          </>
        ) : (
          <>
            <button
              onClick={editor.abort}
              className="inline-flex items-center gap-2 px-4 py-[7px] rounded-lg text-[12px] font-semibold bg-fail/15 text-fail border border-fail/25 hover:bg-fail/25 active:translate-y-px transition-all"
              aria-label="Stop execution"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="8" height="8" rx="1" />
              </svg>
              Stop
            </button>
            <div className="flex items-center gap-2 ml-2">
              <Spinner />
              <span className="text-[12px] text-accent font-medium">
                {editor.compiling ? 'Compiling...' : 'Running...'}
              </span>
            </div>
          </>
        )}

        <div className="flex-1" />
        {editor.sseError && !editor.running && (
          <span className="text-[11px] text-fail font-medium flex items-center gap-1.5 animate-fade-in" role="alert">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 3.5V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
            {editor.sseError}
          </span>
        )}
      </div>

      {/* Vertical resizer */}
      <div
        onMouseDown={outputResize.onMouseDown}
        className="resizer-grip-v h-1.5 cursor-row-resize shrink-0 relative hover:bg-accent/20 active:bg-accent/30 transition-colors"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize output panel"
        tabIndex={0}
      />

      {/* Output */}
      <div
        style={{ height: `${outputResize.size}px` }}
        className="shrink-0 flex flex-col"
      >
        <OutputPanel
          lines={editor.outputLines}
          testResults={editor.testResults}
          label={editor.outputLabel}
          summary={editor.summary}
        />
      </div>
    </section>
  );
}
