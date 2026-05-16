'use client';
/* eslint-disable react-compiler/react-compiler */
'use no memo'; // Opt out of React Compiler — manages imperative Monaco model lifecycle

import { useRef, useEffect } from 'react';
import type * as Monaco from 'monaco-editor';
import { langForFile } from '@/lib/lang';

/**
 * Maintains a stable Map<filename, ITextModel> across tab switches.
 * Instead of remounting <Editor> per tab, we keep one editor instance
 * and swap models via editor.setModel(). View states (cursor, scroll)
 * are saved/restored per file.
 */
export function useMonacoModels() {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const modelsRef = useRef<Map<string, Monaco.editor.ITextModel>>(new Map());
  const viewStatesRef = useRef<Map<string, Monaco.editor.ICodeEditorViewState | null>>(new Map());
  const activeFileRef = useRef<string>('');
  const readyRef = useRef(false);

  const init = (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    readyRef.current = true;
  };

  const isReady = () => readyRef.current;

  const ensureModel = (filename: string, content: string): Monaco.editor.ITextModel | null => {
    const monaco = monacoRef.current;
    if (!monaco) return null;

    const existing = modelsRef.current.get(filename);
    if (existing && !existing.isDisposed()) return existing;

    const uri = monaco.Uri.parse(`file:///${filename}`);
    const model =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel(content, langForFile(filename), uri);
    modelsRef.current.set(filename, model);
    return model;
  };

  const loadFiles = (editableFiles: Record<string, string>, readOnlyFiles: Record<string, string>) => {
    for (const [name, content] of Object.entries(editableFiles)) {
      ensureModel(name, content);
    }
    for (const [name, content] of Object.entries(readOnlyFiles)) {
      ensureModel(name, content);
    }
  };

  const switchTo = (filename: string, readOnly: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;

    // Save current view state
    if (activeFileRef.current) {
      viewStatesRef.current.set(activeFileRef.current, editor.saveViewState());
    }

    activeFileRef.current = filename;
    const model = modelsRef.current.get(filename);
    if (model) {
      editor.setModel(model);
      editor.updateOptions({ readOnly });

      const saved = viewStatesRef.current.get(filename);
      if (saved) {
        editor.restoreViewState(saved);
      }
      editor.focus();
    }
  };

  const updateContent = (filename: string, content: string) => {
    const model = modelsRef.current.get(filename);
    if (model && model.getValue() !== content) {
      model.setValue(content);
    }
  };

  const getContent = (filename: string): string => {
    const model = modelsRef.current.get(filename);
    return model?.getValue() ?? '';
  };

  const getAllEditableContent = (editableNames: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const name of editableNames) {
      result[name] = getContent(name);
    }
    return result;
  };

  const setDiagnostics = (filename: string, diagnostics: Array<{ line: number; col: number; severity: 'error' | 'warning' | 'info'; message: string }>) => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const model = modelsRef.current.get(filename);
    if (!model || model.isDisposed()) return;

    // Monaco's getLineMaxColumn(N) throws if N is not in [1, lineCount];
    // setModelMarkers itself also rejects markers with out-of-range
    // start/end positions. gcc/clang routinely report "expected ';' at
    // end of file" on line N+1 of an N-line buffer, and template error
    // chains can name lines deep inside an expanded include that don't
    // map to anything in the live editor model. Pre-clamp every value
    // here so a single bad diagnostic in the batch doesn't bubble up
    // through .map() and lose the entire batch's worth of markers.
    const lineCount = model.getLineCount();
    const markers = diagnostics.map(d => {
      const safeLine = Math.max(1, Math.min(lineCount, d.line));
      const safeCol = Math.max(1, d.col);
      const maxCol = model.getLineMaxColumn(safeLine);
      return {
        severity:
          d.severity === 'error' ? monaco.MarkerSeverity.Error
          : d.severity === 'warning' ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
        startLineNumber: safeLine,
        startColumn: Math.min(safeCol, maxCol),
        endLineNumber: safeLine,
        endColumn: maxCol,
        message: d.message,
      };
    });

    monaco.editor.setModelMarkers(model, 'compiler', markers);
  };

  const clearAllDiagnostics = () => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    for (const model of modelsRef.current.values()) {
      if (!model.isDisposed()) {
        monaco.editor.setModelMarkers(model, 'compiler', []);
      }
    }
  };

  const disposeAll = () => {
    for (const model of modelsRef.current.values()) {
      if (!model.isDisposed()) model.dispose();
    }
    modelsRef.current.clear();
    viewStatesRef.current.clear();
    activeFileRef.current = '';
  };

  // Unmount-only cleanup. disposeAll closes over refs, so its changing identity
  // each render is irrelevant — but if listed as a dep it fires the cleanup on
  // every re-render and disposes every model, blanking the editor on tab switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => disposeAll(), []);

  return {
    init,
    isReady,
    loadFiles,
    switchTo,
    updateContent,
    getContent,
    getAllEditableContent,
    setDiagnostics,
    clearAllDiagnostics,
    disposeAll,
    editorRef,
  };
}
