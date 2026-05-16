/**
 * Regression test for "setDiagnostics throws and drops the entire marker
 * batch when gcc/clang reports a line past the end of the user's buffer".
 *
 * Real-world repro chain:
 *   1. User code is missing a trailing `}` (or `;`).
 *   2. gcc reports `hello.cpp:6:1: error: expected '}' at end of input`
 *      on what is technically line 6 of a 5-line file.
 *   3. parseDiagnostics happily produces { line: 6, col: 1, ... }.
 *   4. useMonacoModels.setDiagnostics maps the diagnostics to Monaco
 *      IMarkerData and calls model.getLineMaxColumn(6) on a 5-line
 *      model. Real Monaco throws "Illegal value for lineNumber" on any
 *      lineNumber outside [1, lineCount].
 *   5. The throw escapes the .map(), so setDiagnostics throws. The
 *      caller is useProblemEditor.run.onCompileEnd — the throw escapes
 *      the SSE event handler, lands in the React event queue, and at
 *      minimum drops EVERY marker from this batch (including valid
 *      diagnostics on lower lines, the ones the user actually wants).
 *
 * The fix clamps every (line, col) to the model's real bounds before
 * calling getLineMaxColumn. The marker for an out-of-range line lands
 * on the last line — the position is approximate, but the message is
 * preserved and the user sees that something is wrong AT all.
 *
 * This test uses a Monaco mock that throws like the real engine when
 * getLineMaxColumn is asked for an invalid line. The earlier
 * monaco-models-runtime mock returns 1 unconditionally, which would
 * not have caught this regression.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';

import { useMonacoModels } from '../hooks/useMonacoModels.js';

after(() => {
  GlobalRegistrator.unregister();
});

interface CapturedMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  severity: number;
  message: string;
}

/**
 * Mock that mimics real Monaco's strict line-bounds check. lineCount is
 * fixed to whatever the file's source had when the mock was constructed
 * (matching how real Monaco computes lineCount from the buffer).
 */
function createStrictMonacoMock(fileLineCount: number) {
  const captured: CapturedMarker[] = [];

  class MockModel {
    public disposed = false;
    constructor(public value: string, public language: string, public uri: any) {}
    isDisposed() { return this.disposed; }
    dispose() { this.disposed = true; }
    getValue() { return this.value; }
    setValue(v: string) { this.value = v; }
    getLineCount() { return fileLineCount; }
    getLineMaxColumn(lineNumber: number) {
      // Real Monaco throws on out-of-range lineNumber. The fix has to
      // pre-clamp; otherwise this throw escapes the .map() inside
      // setDiagnostics and the whole batch is lost.
      if (lineNumber < 1 || lineNumber > fileLineCount) {
        throw new Error(`Illegal value for lineNumber: ${lineNumber}`);
      }
      return 80; // arbitrary; just needs to be a finite positive number
    }
  }

  const byUri = new Map<string, MockModel>();
  const monaco = {
    Uri: {
      parse(s: string) { return { path: s.replace(/^file:\/\//, ''), toString() { return s; } }; },
    },
    editor: {
      getModel(uri: { toString(): string }) { return byUri.get(uri.toString()) ?? null; },
      createModel(value: string, language: string, uri: { toString(): string }) {
        const m = new MockModel(value, language, uri);
        byUri.set(uri.toString(), m);
        return m;
      },
      setModelMarkers(_model: any, _owner: string, markers: CapturedMarker[]) {
        captured.push(...markers);
      },
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
  } as any;

  const editor = {
    setModel() {}, updateOptions() {},
    saveViewState() { return null; }, restoreViewState() {}, focus() {},
  } as any;

  return { monaco, editor, captured };
}

describe('useMonacoModels.setDiagnostics clamps out-of-range positions', () => {
  it('does not throw when a diagnostic line exceeds the model line count', () => {
    // 5-line file, diagnostic says line 6 — the classic "expected '}' at
    // end of input" case.
    const { monaco, editor, captured } = createStrictMonacoMock(5);
    const { result } = renderHook(() => useMonacoModels());
    act(() => {
      result.current.init(editor, monaco);
      result.current.loadFiles({ 'hello.cpp': 'line\nline\nline\nline\nline' }, {});
    });

    assert.doesNotThrow(() => {
      result.current.setDiagnostics('hello.cpp', [
        { line: 6, col: 1, severity: 'error', message: "expected '}' at end of input" },
      ]);
    });

    assert.equal(captured.length, 1, 'one marker should have been written');
    // The out-of-range line was clamped to the last valid line (5).
    assert.equal(captured[0].startLineNumber, 5);
    assert.equal(captured[0].endLineNumber, 5);
    assert.equal(captured[0].message, "expected '}' at end of input");
  });

  it('keeps every valid diagnostic when one in the batch is out of range', () => {
    // Pre-fix, the entire batch was lost because the first diagnostic
    // threw inside the .map(). This is the real cost: not "we don't
    // show the bad one", but "we show NONE of them, including the
    // perfectly-valid earlier errors that point at real lines".
    const { monaco, editor, captured } = createStrictMonacoMock(3);
    const { result } = renderHook(() => useMonacoModels());
    act(() => {
      result.current.init(editor, monaco);
      result.current.loadFiles({ 'a.cpp': 'a\nb\nc' }, {});
    });

    result.current.setDiagnostics('a.cpp', [
      { line: 1, col: 1, severity: 'error', message: 'first real error' },
      { line: 99, col: 1, severity: 'error', message: 'out of range' },
      { line: 2, col: 5, severity: 'warning', message: 'second real warning' },
    ]);

    assert.equal(captured.length, 3, 'all three diagnostics should produce markers');
    assert.equal(captured[0].message, 'first real error');
    assert.equal(captured[1].message, 'out of range');
    assert.equal(captured[2].message, 'second real warning');
    // Valid ones land where they were asked to.
    assert.equal(captured[0].startLineNumber, 1);
    assert.equal(captured[2].startLineNumber, 2);
    // Out-of-range one was clamped to the last line.
    assert.equal(captured[1].startLineNumber, 3);
  });

  it('clamps a non-positive line number up to 1', () => {
    // Defensive: parseDiagnostics uses parseInt with no lower bound. A
    // weird compiler output like ":0:1: error" would yield line: 0,
    // and Monaco rejects that too.
    const { monaco, editor, captured } = createStrictMonacoMock(5);
    const { result } = renderHook(() => useMonacoModels());
    act(() => {
      result.current.init(editor, monaco);
      result.current.loadFiles({ 'a.cpp': 'a\nb\nc\nd\ne' }, {});
    });

    assert.doesNotThrow(() => {
      result.current.setDiagnostics('a.cpp', [
        { line: 0, col: 0, severity: 'error', message: 'odd' },
      ]);
    });

    assert.equal(captured[0].startLineNumber, 1);
    assert.equal(captured[0].startColumn, 1, 'col 0 should be clamped up to 1 (Monaco is 1-based)');
  });

  it('clamps startColumn to never exceed the line max column', () => {
    // If a diagnostic carries a column that is past the end of the
    // resolved line, Monaco rejects the marker. Cap it.
    const { monaco, editor, captured } = createStrictMonacoMock(5);
    const { result } = renderHook(() => useMonacoModels());
    act(() => {
      result.current.init(editor, monaco);
      result.current.loadFiles({ 'a.cpp': 'a\nb\nc\nd\ne' }, {});
    });

    result.current.setDiagnostics('a.cpp', [
      { line: 1, col: 9999, severity: 'error', message: 'far column' },
    ]);

    // The mock's getLineMaxColumn returns 80 for any in-range line.
    assert.equal(captured[0].startColumn, 80);
    assert.equal(captured[0].endColumn, 80);
  });
});
