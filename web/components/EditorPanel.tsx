'use client';

import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { ProblemEditorState } from '@/hooks/useProblemEditor';
import { useResizable } from '@/hooks/useResizable';
import { OutputPanel } from './OutputPanel';

interface EditorPanelProps {
  editor: ProblemEditorState;
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

      // Monaco is now ready — load files that the useEffect already computed
      editor.loadIntoModels();

      // Bind keyboard shortcuts via Monaco's command system (no window listener conflicts)
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => editor.run('run'),
      );
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => editor.run('test'),
      );

      // Cursor tracking
      editorInstance.onDidChangeCursorPosition(
        (e: { position: { lineNumber: number; column: number } }) => {
          editor.setCursor(e.position.lineNumber, e.position.column);
        },
      );

      // Content change → persist
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
        className="h-[34px] flex bg-bg-1 border-b border-border-soft overflow-x-auto shrink-0"
        role="tablist"
        aria-label="File tabs"
      >
        {editor.allFiles.map(({ name, editable }) => (
          <button
            key={name}
            onClick={() => editor.setActiveFile(name)}
            role="tab"
            aria-selected={editor.activeFile === name}
            aria-label={`${name}${!editable ? ' (read only)' : ''}`}
            className={`relative flex items-center gap-1.5 px-3.5 h-full border-r border-border-soft font-mono text-xs whitespace-nowrap transition-colors hover:bg-white/[0.03] ${
              editor.activeFile === name
                ? editable
                  ? 'bg-bg-0 text-text-bright'
                  : 'bg-bg-0 text-text-dim'
                : editable
                  ? 'text-text-dim hover:text-text-base'
                  : 'text-text-mute hover:text-text-dim'
            }`}
          >
            {editor.activeFile === name && (
              <span
                className={`absolute top-0 left-0 right-0 h-[2px] ${
                  editable ? 'bg-accent' : 'bg-text-mute'
                }`}
              />
            )}
            <span
              className={`text-[9px] ${
                editable ? 'text-accent opacity-70' : 'text-text-mute'
              }`}
            >
              {editable ? '\u25CF' : '\uD83D\uDD12'}
            </span>
            <span>{name}</span>
          </button>
        ))}
      </div>

      {/* Monaco editor — single instance, models swap on tab change */}
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
            padding: { top: 12, bottom: 12 },
          }}
        />
        {!editor.isActiveEditable && (
          <div className="absolute top-2.5 right-5 bg-black/55 backdrop-blur text-text-dim text-[10px] px-2.5 py-0.5 rounded-[10px] pointer-events-none z-10 tracking-wider uppercase border border-border-soft">
            Read Only
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="h-11 flex items-center gap-2 px-3.5 bg-bg-1 border-t border-border-soft shrink-0">
        <button
          onClick={() => editor.run('run')}
          disabled={editor.running}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold bg-accent text-bg-0 hover:bg-[#93b5f8] disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-px transition"
          aria-label="Run program (Cmd+Enter)"
        >
          <span className="text-[11px]">{'\u25B6'}</span>
          <span>Run</span>
          <kbd>{'\u2318\u21B5'}</kbd>
        </button>
        <button
          onClick={() => editor.run('test')}
          disabled={editor.running}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold bg-good text-bg-0 hover:bg-[#b4dc85] disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-px transition"
          aria-label="Run tests (Cmd+Shift+Enter)"
        >
          <span className="text-[11px]">{'\u2713'}</span>
          <span>Test</span>
          <kbd>{'\u2318\u21E7\u21B5'}</kbd>
        </button>
        <button
          onClick={editor.reset}
          disabled={editor.running}
          title="Restore starter code"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold bg-transparent text-text-dim border border-border-soft hover:bg-bg-2 hover:text-text-base hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-px transition"
          aria-label="Reset to starter code"
        >
          <span className="text-[11px]">{'\u21BA'}</span>
          <span>Reset</span>
        </button>
        <div className="flex-1" />
        {editor.running && (
          <span className="text-xs text-accent font-medium animate-pulse-soft" role="status">
            {editor.compiling ? 'Compiling...' : 'Running...'}
          </span>
        )}
        {editor.sseError && !editor.running && (
          <span className="text-xs text-fail font-medium" role="alert">
            {editor.sseError}
          </span>
        )}
      </div>

      {/* Vertical resizer */}
      <div
        onMouseDown={outputResize.onMouseDown}
        className="h-1 cursor-row-resize shrink-0 hover:bg-accent-dim active:bg-accent-dim transition"
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
          label={editor.outputLabel}
          summary={editor.summary}
        />
      </div>
    </section>
  );
}
