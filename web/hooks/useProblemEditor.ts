'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ProblemDetail, SentinelEvent, Status, FileTab, TestResult } from '@/lib/types';
import { inferStatus, buildSummary } from '@/lib/status';
import { loadCode, saveCode, clearCode, loadStatus, saveStatus } from '@/lib/storage';
import { parseDiagnostics } from '@/lib/diagnostics';
import { useSSE } from './useSSE';
import { useMonacoModels } from './useMonacoModels';

interface OutputLine {
  text: string;
  cls: string;
}

export interface ProblemEditorState {
  /* Files */
  activeFile: string;
  allFiles: FileTab[];
  isActiveEditable: boolean;
  starterFiles: Record<string, string>;
  editableNames: string[];

  /* Output */
  outputLines: OutputLine[];
  testResults: TestResult[];
  outputLabel: string;
  summary: string | null;
  running: boolean;
  compiling: boolean;
  sseError: string | null;
  showConfetti: boolean;

  /* Status */
  status: Status;

  /* Cursor */
  cursorLine: number;
  cursorCol: number;

  /* Monaco models handle */
  models: ReturnType<typeof useMonacoModels>;

  /* Actions */
  setActiveFile: (name: string) => void;
  run: (mode: 'run' | 'test') => void;
  abort: () => void;
  reset: () => void;
  setCursor: (line: number, col: number) => void;
  onContentChange: (filename: string, content: string) => void;
  loadIntoModels: () => void;
  dismissConfetti: () => void;
}

export function useProblemEditor(problem: ProblemDetail): ProblemEditorState {
  const models = useMonacoModels();
  const sse = useSSE();

  const [activeFile, setActiveFileRaw] = useState<string>('');
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [outputLabel, setOutputLabel] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [status, setStatusState] = useState<Status>('unsolved');
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Track starter files (from server) for reset
  const starterRef = useRef<Record<string, string>>({});
  const problemIdRef = useRef(problem.id);
  const effectiveFilesRef = useRef<Record<string, string>>({});
  const readOnlyFilesRef = useRef<Record<string, string>>({});
  const stderrBufferRef = useRef('');

  // Load files into Monaco models — safe to call before or after monaco init.
  // No-ops if Monaco hasn't mounted yet; EditorPanel calls this again after init.
  const loadIntoModels = useCallback(() => {
    if (!models.isReady()) return;
    models.disposeAll();
    models.loadFiles(effectiveFilesRef.current, readOnlyFilesRef.current);
    const firstName = Object.keys(effectiveFilesRef.current)[0] ?? '';
    if (firstName) {
      models.switchTo(firstName, false); // first file is always editable
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On problem change: compute files, set state, try loading models
  useEffect(() => {
    problemIdRef.current = problem.id;
    starterRef.current = problem.files;

    // Build the effective file contents (starter + saved overrides)
    const effective: Record<string, string> = {};
    for (const [name, starter] of Object.entries(problem.files)) {
      const saved = loadCode(problem.id, name);
      effective[name] = saved ?? starter;
    }

    effectiveFilesRef.current = effective;
    readOnlyFilesRef.current = problem.readOnlyFiles;

    const firstName = Object.keys(effective)[0] ?? '';
    setActiveFileRaw(firstName);
    setOutputLines([]);
    setOutputLabel('');
    setSummary(null);
    setStatusState(loadStatus(problem.id));

    // Try loading into Monaco — will no-op if editor hasn't mounted yet
    loadIntoModels();
  }, [problem.id, loadIntoModels]); // eslint-disable-line react-hooks/exhaustive-deps

  const editableNames = useMemo(() => Object.keys(problem.files), [problem.files]);

  const allFiles: FileTab[] = useMemo(
    () => [
      ...editableNames.map(name => ({ name, editable: true })),
      ...Object.keys(problem.readOnlyFiles).map(name => ({ name, editable: false })),
    ],
    [editableNames, problem.readOnlyFiles],
  );

  const isActiveEditable = useMemo(
    () => editableNames.includes(activeFile),
    [editableNames, activeFile],
  );

  const setActiveFile = useCallback(
    (name: string) => {
      setActiveFileRaw(name);
      const editable = Object.keys(problem.files).includes(name);
      models.switchTo(name, !editable);
    },
    [models, problem.files],
  );

  const onContentChange = useCallback(
    (filename: string, content: string) => {
      const starter = starterRef.current[filename] ?? '';
      saveCode(problemIdRef.current, filename, content, starter);
    },
    [],
  );

  const stripAnsi = useCallback((s: string) => s.replace(/\x1b\[[0-9;]*m/g, ''), []);

  const appendOutput = useCallback((text: string, cls = '') => {
    const lines = stripAnsi(text).split('\n');
    setOutputLines(prev => [
      ...prev,
      ...lines.map(line => ({ text: line || ' ', cls })),
    ]);
  }, [stripAnsi]);

  const classifyLine = useCallback((line: string): string => {
    if (line.startsWith('[PASS]')) return 'text-pass font-semibold';
    if (line.startsWith('[FAIL]')) return 'text-fail font-semibold';
    if (/error:/i.test(line)) return 'text-fail';
    if (/warning:/i.test(line)) return 'text-warn';
    if (line.startsWith('---')) return 'text-text-mute my-1';
    return '';
  }, []);

  const allFileNames = useMemo(
    () => [...Object.keys(problem.files), ...Object.keys(problem.readOnlyFiles)],
    [problem.files, problem.readOnlyFiles],
  );

  const run = useCallback(
    (mode: 'run' | 'test') => {
      if (running) return;
      setRunning(true);
      setCompiling(true);
      setOutputLines([]);
      setTestResults([]);
      setShowConfetti(false);
      setOutputLabel(mode === 'run' ? 'Run Output' : 'Test Results');
      setSummary(null);
      stderrBufferRef.current = '';
      models.clearAllDiagnostics();

      const files = models.getAllEditableContent(editableNames);

      sse.run(problem.id, files, mode, {
        onStdout: data => appendOutput(data),
        onStderr: data => {
          stderrBufferRef.current += data;
          appendOutput(data, 'text-fail');
        },
        onSentinel: (ev: SentinelEvent) => {
          if (ev.type === 'test') {
            setTestResults(prev => [...prev, {
              name: ev.name,
              status: ev.status,
              message: ev.message,
            }]);
          } else if (ev.type === 'result') {
            const line = `${ev.passed}/${ev.total} tests passed`;
            setOutputLines(prev => [
              ...prev,
              { text: '', cls: '' },
              { text: line, cls: 'font-bold text-text-bright mt-2 pt-2 border-t border-dashed border-border-soft' },
            ]);
          }
        },
        onCompileStart: () => setCompiling(true),
        onCompileEnd: (exitCode) => {
          setCompiling(false);
          // Parse compiler diagnostics from stderr and set Monaco markers
          if (stderrBufferRef.current) {
            const diagMap = parseDiagnostics(stderrBufferRef.current, allFileNames);
            for (const [filename, diags] of diagMap) {
              models.setDiagnostics(filename, diags);
            }
          }
        },
        onRunStart: () => {},
        onRunEnd: () => {},
        onDone: (passed, total, exitCode) => {
          setRunning(false);
          if (mode === 'test') {
            const doneEvent = { kind: 'done' as const, passed, total, exitCode };
            const newStatus = inferStatus(doneEvent);
            const newSummary = buildSummary(doneEvent);
            setStatusState(newStatus);
            setSummary(newSummary);
            saveStatus(problem.id, newStatus, passed, total);
            if (total > 0 && passed === total) {
              setShowConfetti(true);
            }
          }
        },
        onError: msg => {
          setRunning(false);
          setCompiling(false);
          appendOutput(`Error: ${msg}`, 'text-fail font-semibold');
        },
      });
    },
    [running, models, editableNames, allFileNames, sse, problem.id, appendOutput],
  );

  const abort = useCallback(() => {
    sse.abort();
    setRunning(false);
    setCompiling(false);
  }, [sse]);

  const reset = useCallback(() => {
    if (!window.confirm('Reset all editable files to starter code? Your changes will be lost.'))
      return;
    clearCode(problem.id, editableNames);
    for (const [name, content] of Object.entries(starterRef.current)) {
      models.updateContent(name, content);
    }
  }, [problem.id, editableNames, models]);

  const setCursor = useCallback((line: number, col: number) => {
    setCursorLine(line);
    setCursorCol(col);
  }, []);

  const dismissConfetti = useCallback(() => setShowConfetti(false), []);

  return {
    activeFile,
    allFiles,
    isActiveEditable,
    starterFiles: starterRef.current,
    editableNames,
    outputLines,
    testResults,
    outputLabel,
    summary,
    running,
    compiling,
    showConfetti,
    sseError: sse.error,
    status,
    cursorLine,
    cursorCol,
    models,
    setActiveFile,
    run,
    abort,
    reset,
    setCursor,
    onContentChange,
    loadIntoModels,
    dismissConfetti,
  };
}
