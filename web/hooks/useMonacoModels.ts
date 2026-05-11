'use client';

import { useRef, useCallback, useEffect } from 'react';
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

  const init = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      readyRef.current = true;
    },
    [],
  );

  const isReady = useCallback(() => readyRef.current, []);

  const ensureModel = useCallback(
    (filename: string, content: string): Monaco.editor.ITextModel | null => {
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
    },
    [],
  );

  const loadFiles = useCallback(
    (editableFiles: Record<string, string>, readOnlyFiles: Record<string, string>) => {
      for (const [name, content] of Object.entries(editableFiles)) {
        ensureModel(name, content);
      }
      for (const [name, content] of Object.entries(readOnlyFiles)) {
        ensureModel(name, content);
      }
    },
    [ensureModel],
  );

  const switchTo = useCallback((filename: string, readOnly: boolean) => {
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
  }, []);

  const updateContent = useCallback((filename: string, content: string) => {
    const model = modelsRef.current.get(filename);
    if (model && model.getValue() !== content) {
      model.setValue(content);
    }
  }, []);

  const getContent = useCallback((filename: string): string => {
    const model = modelsRef.current.get(filename);
    return model?.getValue() ?? '';
  }, []);

  const getAllEditableContent = useCallback(
    (editableNames: string[]): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const name of editableNames) {
        result[name] = getContent(name);
      }
      return result;
    },
    [getContent],
  );

  const disposeAll = useCallback(() => {
    for (const model of modelsRef.current.values()) {
      if (!model.isDisposed()) model.dispose();
    }
    modelsRef.current.clear();
    viewStatesRef.current.clear();
    activeFileRef.current = '';
  }, []);

  useEffect(() => () => disposeAll(), [disposeAll]);

  return {
    init,
    isReady,
    loadFiles,
    switchTo,
    updateContent,
    getContent,
    getAllEditableContent,
    disposeAll,
    editorRef,
  };
}
