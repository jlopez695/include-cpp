'use client';
/* eslint-disable react-compiler/react-compiler */
'use no memo'; // Opt out of React Compiler — Monaco is imperative and breaks under auto-memoization

import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { OnMount } from '@monaco-editor/react';

const Editor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 bg-[#1e1e1e] flex items-center justify-center">
        <span className="text-text-mute text-sm">Loading editor...</span>
      </div>
    ),
  },
);

// Dynamically imported — monaco-vim accesses `window` at module scope
const loadVim = () => import('monaco-vim').then(m => m.initVimMode);
import type { ProblemEditorState } from '@/hooks/useProblemEditor';
import { useResizable } from '@/hooks/useResizable';
import { loadUiState, saveUiState } from '@/lib/storage';
import { clampFontSize } from '@/lib/editor-settings';
import { OutputPanel } from './OutputPanel';

interface EditorPanelProps {
  editor: ProblemEditorState;
  vimMode: boolean;
  onVimToggle: () => void;
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

export function EditorPanel({ editor, vimMode, onVimToggle }: EditorPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const monacoInstanceRef = useRef<any>(null);
  const editorInstanceRef = useRef<any>(null);
  const vimAdapterRef = useRef<any>(null);
  const vimStatusRef = useRef<HTMLDivElement>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [minimap, setMinimap] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [tabSize, setTabSize] = useState(2);
  const [splitFile, setSplitFile] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState(false);

  // Load persisted editor settings client-side to avoid hydration mismatch
  useEffect(() => {
    const savedFontSize = clampFontSize(loadUiState('fontSize', 13));
    const savedTabSize = loadUiState<number>('tabSize', 2);
    setFontSize(savedFontSize);
    setTabSize(savedTabSize);
  }, []);

  const outputResize = useResizable(
    'output-height',
    220,
    'vertical',
    () => panelRef.current,
    [80, 600],
  );

  // Cmd+Shift+D to toggle diff view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setDiffMode(prev => {
          if (!prev) setSplitFile(null);
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Init/dispose vim mode when toggled or editor becomes ready
  useEffect(() => {
    const ed = editorInstanceRef.current;
    if (!editorReady || !ed || !vimMode) return;

    let disposed = false;
    loadVim().then(initVimMode => {
      if (disposed) return;
      const adapter = initVimMode(ed, vimStatusRef.current);
      vimAdapterRef.current = adapter;
    });

    return () => {
      disposed = true;
      vimAdapterRef.current?.dispose();
      vimAdapterRef.current = null;
    };
  }, [vimMode, editorReady]);

  const handleEditorMount: OnMount = (editorInstance, monaco) => {
    monacoInstanceRef.current = monaco;
    editorInstanceRef.current = editorInstance;
    setEditorReady(true);
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
  };

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

      {/* Monaco editor(s) */}
      <div className={`flex-1 flex overflow-hidden min-h-0 ${(splitFile || diffMode) ? 'gap-px bg-border-soft' : ''}`}>
        <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
          <Editor
            defaultLanguage="cpp"
            theme="vs-dark"
            onMount={handleEditorMount}
            options={{
              fontSize,
              fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", monospace',
              fontLigatures: true,
              minimap: { enabled: minimap },
              scrollBeyondLastLine: false,
              readOnly: !editor.isActiveEditable,
              renderLineHighlight: editor.isActiveEditable ? 'line' : 'none',
              lineNumbers: 'on',
              wordWrap: wordWrap ? 'on' : 'off',
              tabSize,
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

        {/* Diff pane — shows starter code for active file */}
        {diffMode && editor.isActiveEditable && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e] animate-fade-in">
            <div className="flex items-center justify-between px-3 py-1 bg-bg-1 border-b border-border-soft text-[11px] shrink-0">
              <span className="text-text-mute font-mono">Original: {editor.activeFile}</span>
              <button
                onClick={() => setDiffMode(false)}
                className="text-text-mute hover:text-text-bright transition-colors"
                aria-label="Close diff view"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <Editor
              defaultLanguage="cpp"
              theme="vs-dark"
              value={editor.starterFiles[editor.activeFile] ?? ''}
              options={{
                fontSize,
                fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", monospace',
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                readOnly: true,
                renderLineHighlight: 'none',
                lineNumbers: 'on',
                wordWrap: wordWrap ? 'on' : 'off',
                tabSize,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        )}

        {/* Split pane */}
        {splitFile && !diffMode && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e] animate-fade-in">
            <div className="flex items-center justify-between px-3 py-1 bg-bg-1 border-b border-border-soft text-[11px] shrink-0">
              <select
                value={splitFile}
                onChange={e => setSplitFile(e.target.value)}
                className="bg-transparent text-text-base text-[11px] font-mono outline-none cursor-pointer"
              >
                {editor.allFiles.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
              <button
                onClick={() => setSplitFile(null)}
                className="text-text-mute hover:text-text-bright transition-colors"
                aria-label="Close split view"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <Editor
              defaultLanguage="cpp"
              theme="vs-dark"
              value={editor.models.getContent(splitFile)}
              options={{
                fontSize: 13,
                fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", monospace',
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                readOnly: true,
                renderLineHighlight: 'none',
                lineNumbers: 'on',
                wordWrap: 'off',
                tabSize: 2,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        )}
      </div>

      {/* Vim status bar */}
      {vimMode && (
        <div
          ref={vimStatusRef}
          className="h-6 bg-[#1e1e1e] text-text-dim text-[12px] font-mono px-3 flex items-center border-t border-border-soft/50"
        />
      )}

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
        {/* Divider: primary actions | editor preferences */}
        <div className="h-5 w-px bg-border-soft/60 self-center mx-1.5" aria-hidden="true" />
        <button
          onClick={onVimToggle}
          title={vimMode ? 'Disable Vim mode' : 'Enable Vim mode'}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
            vimMode ? 'text-accent bg-accent/10' : 'text-text-mute hover:text-text-dim hover:bg-bg-3'
          }`}
          aria-label="Toggle Vim mode"
        >
          VIM
        </button>
        <div className="flex items-center gap-0.5 mr-1">
          <button
            onClick={() => {
              const next = clampFontSize(fontSize - 1);
              setFontSize(next);
              saveUiState('fontSize', next);
              editor.models.editorRef.current?.updateOptions({ fontSize: next });
            }}
            disabled={fontSize <= 10}
            title="Decrease font size"
            className="hit-area-lg w-6 h-6 flex items-center justify-center rounded text-[11px] font-bold text-text-mute hover:text-text-dim hover:bg-bg-3 disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Decrease font size"
          >
            A<span className="text-[9px]">-</span>
          </button>
          <span className="text-[10px] text-text-mute tabular-nums w-5 text-center">{fontSize}</span>
          <button
            onClick={() => {
              const next = clampFontSize(fontSize + 1);
              setFontSize(next);
              saveUiState('fontSize', next);
              editor.models.editorRef.current?.updateOptions({ fontSize: next });
            }}
            disabled={fontSize >= 24}
            title="Increase font size"
            className="hit-area-lg w-6 h-6 flex items-center justify-center rounded text-[11px] font-bold text-text-mute hover:text-text-dim hover:bg-bg-3 disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Increase font size"
          >
            A<span className="text-[9px]">+</span>
          </button>
        </div>
        <button
          onClick={() => {
            const next = tabSize === 2 ? 4 : 2;
            setTabSize(next);
            saveUiState('tabSize', next);
            editor.models.editorRef.current?.updateOptions({ tabSize: next });
          }}
          title={`Tab size: ${tabSize} spaces (click to toggle)`}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-text-mute hover:text-text-dim hover:bg-bg-3 transition-colors tabular-nums"
          aria-label="Toggle tab size"
        >
          {tabSize}sp
        </button>
        {/* Divider: editor preferences | view toggles */}
        <div className="h-5 w-px bg-border-soft/60 self-center mx-1.5" aria-hidden="true" />
        <button
          onClick={() => {
            setWordWrap(v => !v);
            editor.models.editorRef.current?.updateOptions({ wordWrap: !wordWrap ? 'on' : 'off' });
          }}
          title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          className={`hit-area w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
            wordWrap ? 'text-accent bg-accent/10' : 'text-text-mute hover:text-text-dim hover:bg-bg-3'
          }`}
          aria-label="Toggle word wrap"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 3H12M2 7H10C11.1 7 12 7.9 12 9C12 10.1 11.1 11 10 11H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 9.5L7.5 11L9 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={() => {
            setMinimap(v => !v);
            editor.models.editorRef.current?.updateOptions({ minimap: { enabled: !minimap } });
          }}
          title={minimap ? 'Hide minimap' : 'Show minimap'}
          className={`hit-area w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
            minimap ? 'text-accent bg-accent/10' : 'text-text-mute hover:text-text-dim hover:bg-bg-3'
          }`}
          aria-label="Toggle minimap"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <rect x="10" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.4" />
            <path d="M3 5H7M3 7H6M3 9H7" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
          </svg>
        </button>
        <button
          onClick={() => {
            setDiffMode(prev => {
              if (!prev) setSplitFile(null);
              return !prev;
            });
          }}
          title={diffMode ? 'Close diff view (Cmd+Shift+D)' : 'Compare with starter code (Cmd+Shift+D)'}
          className={`hit-area w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
            diffMode ? 'text-accent bg-accent/10' : 'text-text-mute hover:text-text-dim hover:bg-bg-3'
          }`}
          aria-label="Toggle diff view"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 3V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M10 3V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M6 5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M6 7H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M6 9H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={() => {
            if (splitFile) {
              setSplitFile(null);
            } else {
              setDiffMode(false);
              const other = editor.allFiles.find(f => f.name !== editor.activeFile);
              setSplitFile(other?.name ?? editor.allFiles[0]?.name ?? null);
            }
          }}
          title={splitFile ? 'Close split view' : 'Open split view'}
          className={`hit-area w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
            splitFile ? 'text-accent bg-accent/10' : 'text-text-mute hover:text-text-dim hover:bg-bg-3'
          }`}
          aria-label="Toggle split editor"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 2V12" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
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
          onRerunTests={!editor.running ? () => editor.run('test') : undefined}
          onClear={!editor.running ? editor.clearOutput : undefined}
        />
      </div>
    </section>
  );
}
