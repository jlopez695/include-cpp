/**
 * Real React lifecycle test for the "editor goes blank on tab switch" bug.
 *
 * Renders the useMonacoModels hook with renderHook, supplies a mock Monaco
 * namespace, forces re-renders, and asserts that no Monaco models get
 * disposed across renders — only on unmount. This is the hard guarantee
 * the static-source test (monaco-models-lifecycle.spec.ts) is a proxy for.
 */

// Register a DOM before importing React. node:test runs each spec file in
// its own subprocess (default in Node 22+), so this does not pollute the
// pure-Node specs that intentionally probe `typeof window === 'undefined'`.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

import { useMonacoModels } from '../hooks/useMonacoModels.js';

// Minimal Monaco mock — only the surface useMonacoModels actually touches.
function createMonacoMock() {
  const created: MockModel[] = [];
  const byUri = new Map<string, MockModel>();

  class MockModel {
    public disposed = false;
    constructor(public value: string, public language: string, public uri: { path: string; toString(): string }) {}
    isDisposed() { return this.disposed; }
    dispose() { this.disposed = true; }
    getValue() { return this.value; }
    setValue(v: string) { this.value = v; }
    getLineMaxColumn() { return 1; }
  }

  const monaco = {
    Uri: {
      parse(s: string) { return { path: s.replace(/^file:\/\//, ''), toString() { return s; } }; },
    },
    editor: {
      getModel(uri: { toString(): string }) { return byUri.get(uri.toString()) ?? null; },
      createModel(value: string, language: string, uri: { toString(): string }) {
        const m = new MockModel(value, language, uri as any);
        byUri.set(uri.toString(), m);
        created.push(m);
        return m;
      },
      setModelMarkers() {},
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
  } as any;

  const editor = {
    setModel() {},
    updateOptions() {},
    saveViewState() { return null; },
    restoreViewState() {},
    focus() {},
  } as any;

  return { monaco, editor, created };
}

after(() => {
  GlobalRegistrator.unregister();
});

describe('useMonacoModels lifecycle (real render)', () => {
  it('does not dispose models across re-renders', () => {
    const { monaco, editor, created } = createMonacoMock();

    const { result, rerender, unmount } = renderHook(() => useMonacoModels());

    act(() => {
      result.current.init(editor, monaco);
      result.current.loadFiles({ 'q1.cpp': '// code' }, { 'hello.h': '// header' });
    });

    assert.equal(created.length, 2, 'two models should have been created');
    assert.ok(created.every(m => !m.disposed), 'no model should be disposed after init');

    // Force several re-renders. Pre-fix, each re-render fired the unmount
    // cleanup and disposed every model.
    for (let i = 0; i < 5; i++) rerender();

    assert.ok(
      created.every(m => !m.disposed),
      `models should survive re-renders — got [${created.map(m => m.disposed).join(',')}]`,
    );

    unmount();

    assert.ok(
      created.every(m => m.disposed),
      'models should be disposed on unmount',
    );
  });

  it('models survive state changes in the host component', () => {
    const { monaco, editor, created } = createMonacoMock();

    // Host component drives a state update that re-renders the hook.
    let setCount: (n: number) => void = () => {};
    const { result, unmount } = renderHook(() => {
      const [, set] = useState(0);
      setCount = set;
      return useMonacoModels();
    });

    act(() => {
      result.current.init(editor, monaco);
      result.current.loadFiles({ 'q1.cpp': '// code' }, {});
    });

    assert.equal(created.length, 1);
    assert.equal(created[0].disposed, false);

    // Simulate a tab-switch state update — exactly the trigger of the
    // original bug. The hook re-renders; no model should be disposed.
    for (let i = 1; i <= 3; i++) {
      act(() => setCount(i));
    }

    assert.equal(
      created[0].disposed,
      false,
      'model must not be disposed when host component re-renders',
    );

    unmount();
    assert.equal(created[0].disposed, true, 'model should be disposed on unmount');
  });
});
