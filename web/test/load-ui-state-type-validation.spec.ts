import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage the same way every other storage spec in this dir does —
// happy-dom isn't bootstrapped in this file because we exercise the storage
// helpers directly, not through React.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = globalThis;

import { loadUiState } from '../lib/storage.js';

// Regression for the loadUiState type-cast lie. Pre-fix the body was:
//
//   try { return JSON.parse(raw) as T; } catch { return fallback; }
//
// `as T` is a compile-time lie: at runtime the parsed value is whatever was
// in localStorage, and the only escape hatch back to `fallback` was a
// JSON.parse exception. A devtools edit / clobbering extension / leftover
// from an older build that stored a string under a key the current caller
// expects to be a number flows straight through:
//
//   loadUiState('split-h', 38)               // caller wants number 38
//   localStorage['potd:ui:split-h'] = '"x"'  // got corrupted to a string
//   → returns "x"
//
// useResizable then does `Math.max(20, Math.min(70, "x"))` which coerces
// the string operand to NaN, and the resizable panel collapses to NaN px.
// Recovery requires the user to clear their localStorage by hand because
// every subsequent saveUiState writes the post-drag size back, but the
// next load still goes through the same lying cast.
//
// Post-fix loadUiState checks the *type* of the parsed value against the
// fallback before returning it. Anything that doesn't match the fallback's
// shape (number vs string vs boolean vs array vs object) falls back to the
// caller-supplied value.
describe('loadUiState validates the parsed shape against the fallback type', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('returns the parsed value when the stored shape matches the fallback (number)', () => {
    store['potd:ui:split-h'] = JSON.stringify(42);
    assert.equal(loadUiState('split-h', 38), 42);
  });

  it('returns the parsed value when the stored shape matches the fallback (string)', () => {
    store['potd:ui:theme'] = JSON.stringify('dark');
    assert.equal(loadUiState('theme', 'light'), 'dark');
  });

  it('returns the parsed value when the stored shape matches the fallback (boolean)', () => {
    store['potd:ui:vim'] = JSON.stringify(true);
    assert.equal(loadUiState('vim', false), true);
  });

  it('returns the fallback when stored value is a string but caller expects a number', () => {
    // The bug: corrupted "hello" reaches useResizable as a string, then
    // Math.max(min, Math.min(max, "hello")) is NaN, and the panel breaks.
    store['potd:ui:split-h'] = JSON.stringify('hello');
    assert.equal(loadUiState('split-h', 38), 38);
  });

  it('returns the fallback when stored value is a number but caller expects a string', () => {
    store['potd:ui:theme'] = JSON.stringify(42);
    assert.equal(loadUiState('theme', 'light'), 'light');
  });

  it('returns the fallback when stored value is a boolean but caller expects a number', () => {
    store['potd:ui:split-h'] = JSON.stringify(true);
    assert.equal(loadUiState('split-h', 38), 38);
  });

  it('returns the fallback when stored value is null but caller expects a primitive', () => {
    // `typeof null === 'object'` — without explicit null handling the
    // validator would mis-classify it. JSON null shouldn't reach the
    // useResizable layer as a "valid number".
    store['potd:ui:split-h'] = JSON.stringify(null);
    assert.equal(loadUiState('split-h', 38), 38);
  });

  it('returns the fallback when stored value is an array but caller expects an object', () => {
    // `typeof [] === 'object'`, so a bare typeof check would let an array
    // through when the caller wanted a plain object. Array.isArray needs
    // to match between fallback and parsed.
    store['potd:ui:layout'] = JSON.stringify([1, 2, 3]);
    const fallback = { width: 100, height: 200 };
    const result = loadUiState('layout', fallback);
    assert.deepEqual(result, fallback);
  });

  it('returns the parsed value when stored is an object and fallback is an object', () => {
    store['potd:ui:layout'] = JSON.stringify({ width: 50, height: 60 });
    const fallback = { width: 100, height: 200 };
    const result = loadUiState('layout', fallback);
    assert.deepEqual(result, { width: 50, height: 60 });
  });

  it('returns the parsed value when stored is an array and fallback is an array', () => {
    // Symmetric to the typeof-vs-Array.isArray case above: matching arrays
    // must pass through, not get rejected because the validator over-fires.
    store['potd:ui:list'] = JSON.stringify(['a', 'b', 'c']);
    const fallback: string[] = [];
    assert.deepEqual(loadUiState('list', fallback), ['a', 'b', 'c']);
  });

  it('returns the fallback when stored value is malformed JSON (existing behavior)', () => {
    // Pre-existing behavior — covered by storage-corruption.spec.ts for
    // other keys but not for loadUiState specifically. The fix must NOT
    // regress this path.
    store['potd:ui:split-h'] = '{not json';
    assert.equal(loadUiState('split-h', 38), 38);
  });

  it('returns the fallback when the key is missing', () => {
    assert.equal(loadUiState('never-stored', 38), 38);
  });
});
