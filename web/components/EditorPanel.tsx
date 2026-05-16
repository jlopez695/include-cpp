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
import { EditorOverflowMenu } from './EditorOverflowMenu';

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

  // Reset per-problem UI state (split pane + diff pane) whenever the set
  // of files changes — i.e. a problem switch. Without this, splitFile is
  // carried over to the new problem and points at a filename that doesn't
  // exist in the new problem's models, so:
  //   - editor.models.getContent(splitFile) returns '' (the split pane
  //     renders blank)
  //   - the file-picker <select> in the split chrome has `value={splitFile}`
  //     with no matching <option>, so the dropdown silently desyncs from
  //     its visible state (the user sees the first file selected but the
  //     ref-of-truth is still the dead filename)
  //   - the chrome's toggle button stays "active" because splitFile is
  //     truthy, so the user has to click it twice to actually open a real
  //     split.
  // diffMode has the same per-problem semantics — comparing against an
  // earlier problem's starter code on a new problem is meaningless.
  //
  // The "did the problem change" signal is the joined filename list: if
  // any file is added, removed, or renamed the key changes; if the user
  // re-navigates to the exact same problem (a no-op for the editor) it
  // doesn't. The effect is a no-op when state is already cleared, so the
  // first-mount run costs nothing.
  const filesKey = editor.allFiles.map(f => f.name).join('|');
  useEffect(() => {
    setSplitFile(null);
    setDiffMode(false);
  }, [filesKey]);

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
      id="editor-panel"
      ref={panelRef}
      tabIndex={-1}
      className="flex-1 flex flex-col overflow-hidden min-w-0 bg-bg-0"
      aria-label="Code editor"
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
              className={`group relative flex items-center gap-1.5 px-4 h-full border-r border-border-soft font-mono text-[13px] whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-bg-0 text-text-bright elevation-1'
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
                <span className="w-1 h-1 rounded-full bg-text-mute shrink-0" title="Modified" />
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
      </div>

      {/* Vim status bar */}
      {vimMode && (
        <div
          ref={vimStatusRef}
          className="h-6 bg-[#1e1e1e] text-text-dim text-[12px] font-mono px-3 flex items-center border-t border-border-soft/50"
        />
      )}

      {/* Action bar \u2014 Run is the primary action with full elevation
          (light from sky: top inner highlight + bottom shadow, inverts on
          press). Test / Stop are secondary outlined with elevation-1. */}
      <div className="h-12 flex items-center gap-3 px-3 bg-bg-1 border-t border-border-soft shrink-0">
        {!editor.running ? (
          <>
            <button
              onClick={() => editor.run('run')}
              className="px-4 py-1.5 rounded-md text-[13px] font-medium bg-accent text-bg-0 hover:brightness-110 elevation-button"
              aria-label="Run program (Cmd+Enter)"
            >
              Run
            </button>
            <button
              onClick={() => editor.run('test')}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium text-good border border-good/40 hover:bg-good/10 elevation-1 transition-colors"
              aria-label="Run tests (Cmd+Shift+Enter)"
            >
              Test
            </button>
            <button
              onClick={editor.reset}
              title="Restore starter code"
              className="px-2 py-1 text-[13px] text-text-mute hover:text-text-base transition-colors"
              aria-label="Reset to starter code"
            >
              Reset
            </button>
          </>
        ) : (
          <>
            <button
              onClick={editor.abort}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium text-fail border border-fail/40 hover:bg-fail/10 elevation-1 transition-colors"
              aria-label="Stop execution"
            >
              Stop
            </button>
            <div className="flex items-center gap-2">
              <Spinner />
              <span className="text-[13px] text-text-dim">
                {editor.compiling ? 'Compiling\u2026' : 'Running\u2026'}
              </span>
            </div>
          </>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              const next = clampFontSize(fontSize - 1);
              setFontSize(next);
              saveUiState('fontSize', next);
              editor.models.editorRef.current?.updateOptions({ fontSize: next });
            }}
            disabled={fontSize <= 10}
            title="Decrease font size"
            className="hit-area-lg w-6 h-6 flex items-center justify-center text-[11px] text-text-mute hover:text-text-base disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Decrease font size"
          >
            A<span className="text-[9px]">\u2212</span>
          </button>
          <span className="text-[11px] text-text-mute tabular-nums w-5 text-center">{fontSize}</span>
          <button
            onClick={() => {
              const next = clampFontSize(fontSize + 1);
              setFontSize(next);
              saveUiState('fontSize', next);
              editor.models.editorRef.current?.updateOptions({ fontSize: next });
            }}
            disabled={fontSize >= 24}
            title="Increase font size"
            className="hit-area-lg w-6 h-6 flex items-center justify-center text-[11px] text-text-mute hover:text-text-base disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Increase font size"
          >
            A<span className="text-[9px]">+</span>
          </button>
        </div>
        <button
          onClick={() => {
            setDiffMode(prev => {
              if (!prev) setSplitFile(null);
              return !prev;
            });
          }}
          title={diffMode ? 'Close diff view (Cmd+Shift+D)' : 'Compare with starter code (Cmd+Shift+D)'}
          className={`hit-area w-7 h-7 flex items-center justify-center transition-colors ${
            diffMode ? 'text-accent' : 'text-text-mute hover:text-text-base'
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
          className={`hit-area w-7 h-7 flex items-center justify-center transition-colors ${
            splitFile ? 'text-accent' : 'text-text-mute hover:text-text-base'
          }`}
          aria-label="Toggle split editor"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 2V12" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        {/* Overflow: rarely-used editor settings (vim, word wrap, minimap, tab size).
            Progressive Disclosure — these stay one click away rather than crowding
            the action bar with toggles 95% of users won't touch in a session. */}
        <EditorOverflowMenu
          items={[
            { label: 'Vim mode', active: vimMode, onToggle: onVimToggle },
            {
              label: 'Word wrap',
              active: wordWrap,
              onToggle: () => {
                setWordWrap(v => !v);
                editor.models.editorRef.current?.updateOptions({ wordWrap: !wordWrap ? 'on' : 'off' });
              },
            },
            {
              label: 'Minimap',
              active: minimap,
              onToggle: () => {
                setMinimap(v => !v);
                editor.models.editorRef.current?.updateOptions({ minimap: { enabled: !minimap } });
              },
            },
            {
              label: 'Tab size',
              active: tabSize === 4,
              hint: `${tabSize} sp`,
              onToggle: () => {
                const next = tabSize === 2 ? 4 : 2;
                setTabSize(next);
                saveUiState('tabSize', next);
                editor.models.editorRef.current?.updateOptions({ tabSize: next });
              },
            },
          ]}
        />
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
        className="h-1.5 cursor-row-resize shrink-0 hover:bg-accent/30 active:bg-accent/40 transition-colors"
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
