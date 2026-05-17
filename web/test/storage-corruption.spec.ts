import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node.js tests
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = globalThis;

import {
  recordSolveDate,
  getStreak,
  loadBestResult,
  saveBestResult,
  getBookmarkedIds,
  toggleBookmark,
  isBookmarked,
  loadStatus,
} from '../lib/storage.js';

// Each top-level read of a JSON-encoded localStorage key used to throw
// synchronously when the value wasn't a valid JSON encoding of the
// expected shape — bricking the streak counter, best-result display,
// and sidebar bookmarks until the user manually cleared their storage.
// Realistic corruption sources: a devtools edit, a clobbering browser
// extension, a half-written value from a tab killed mid-setItem.
describe('storage: corrupt localStorage values must not throw', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  /* ── solve-dates / streak ── */

  it('getStreak returns 0 when potd:solve-dates is not valid JSON', () => {
    store['potd:solve-dates'] = '{not json';
    assert.equal(getStreak(), 0);
  });

  it('getStreak returns 0 when potd:solve-dates parses to a non-array', () => {
    store['potd:solve-dates'] = '"hello"';
    assert.equal(getStreak(), 0);
  });

  it('getStreak returns 0 when potd:solve-dates parses to an array of wrong-typed entries', () => {
    store['potd:solve-dates'] = JSON.stringify([1, 2, 3]);
    // After filtering non-strings, dates.length === 0 → 0 streak.
    assert.equal(getStreak(), 0);
  });

  it('recordSolveDate recovers from a corrupt potd:solve-dates and writes a clean value', () => {
    store['potd:solve-dates'] = 'totally broken';
    assert.doesNotThrow(() => recordSolveDate());
    const after = JSON.parse(store['potd:solve-dates']);
    assert.ok(Array.isArray(after), 'corrupt value should be healed into an array');
    assert.equal(after.length, 1);
    assert.match(after[0], /^\d{4}-\d{2}-\d{2}$/);
  });

  it('recordSolveDate preserves valid prior entries when storage is healthy', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    store['potd:solve-dates'] = JSON.stringify([yesterday]);
    recordSolveDate();
    const after = JSON.parse(store['potd:solve-dates']);
    assert.ok(after.includes(yesterday), "valid prior entries must not be wiped by the safe-parse path");
  });

  /* ── best result ── */

  it('loadBestResult returns null when potd:best:<id> is not valid JSON', () => {
    store['potd:best:POTD0'] = '{half written';
    assert.equal(loadBestResult('POTD0'), null);
  });

  it('loadBestResult returns null when parsed shape is missing fields', () => {
    store['potd:best:POTD0'] = JSON.stringify({ passed: 3 });
    assert.equal(loadBestResult('POTD0'), null);
  });

  it('loadBestResult returns null when parsed shape has wrong field types', () => {
    store['potd:best:POTD0'] = JSON.stringify({ passed: '3', total: '5' });
    assert.equal(loadBestResult('POTD0'), null);
  });

  it('saveBestResult heals a corrupt entry on next write', () => {
    store['potd:best:POTD0'] = 'broken';
    const saved = saveBestResult('POTD0', 3, 5);
    assert.equal(saved, true, 'should treat corrupt prior as "no best" and write the new result');
    assert.deepEqual(loadBestResult('POTD0'), { passed: 3, total: 5 });
  });

  /* ── bookmarks ── */

  it('getBookmarkedIds returns [] when potd:bookmarks is not valid JSON', () => {
    store['potd:bookmarks'] = '[POTD0,';
    assert.deepEqual(getBookmarkedIds(), []);
  });

  it('getBookmarkedIds returns [] when potd:bookmarks parses to a non-array', () => {
    store['potd:bookmarks'] = JSON.stringify({ POTD0: true });
    assert.deepEqual(getBookmarkedIds(), []);
  });

  it('isBookmarked returns false (does not throw) when storage is corrupt', () => {
    store['potd:bookmarks'] = 'garbage';
    assert.doesNotThrow(() => assert.equal(isBookmarked('POTD0'), false));
  });

  it('toggleBookmark heals a corrupt potd:bookmarks and adds the new id', () => {
    store['potd:bookmarks'] = 'broken';
    const result = toggleBookmark('POTD0');
    assert.equal(result, true);
    assert.deepEqual(getBookmarkedIds(), ['POTD0']);
  });

  /* ── per-problem status ── */

  // Pre-fix, loadStatus did `(safeGetItem(...) as Status) || 'unsolved'`
  // — the cast told TypeScript whatever string was in storage was
  // a Status, but at runtime anything truthy passed through unchanged.
  // The post-fix path validates against the actual set of values
  // saveStatus is allowed to write ('solved' | 'attempted') and falls
  // back to 'unsolved' for anything else.
  it('loadStatus returns "solved" when storage holds the literal string', () => {
    store['potd:status:POTD0'] = 'solved';
    assert.equal(loadStatus('POTD0'), 'solved');
  });

  it('loadStatus returns "attempted" when storage holds the literal string', () => {
    store['potd:status:POTD0'] = 'attempted';
    assert.equal(loadStatus('POTD0'), 'attempted');
  });

  it('loadStatus normalizes an arbitrary corrupted value to "unsolved"', () => {
    // A clobbering extension wrote a value that isn't one of the
    // persisted states. Without validation the StatusDot's
    // aria-label would announce the corrupted string verbatim and
    // pickRandom's filters would miss in subtle ways.
    store['potd:status:POTD0'] = 'garbage-value';
    assert.equal(loadStatus('POTD0'), 'unsolved');
  });

  it('loadStatus normalizes the legacy "unsolved" literal to "unsolved" (no-op)', () => {
    // saveStatus only persists 'solved' or 'attempted' (it deletes
    // the row for 'unsolved'), but a localStorage row inherited from
    // an older build might still hold the literal 'unsolved'. The
    // validator must reject it as not-in-the-allowed-set, which
    // happens to produce the same observable result. The pin is the
    // path through the validator, not the return value alone.
    store['potd:status:POTD0'] = 'unsolved';
    assert.equal(loadStatus('POTD0'), 'unsolved');
  });

  it('loadStatus returns "unsolved" when the key is missing entirely', () => {
    assert.equal(loadStatus('POTD0'), 'unsolved');
  });

  it('loadStatus returns "unsolved" when storage holds the empty string', () => {
    // `safeSetItem('', '')` is rare but possible — Firefox in private
    // mode used to set keys to '' on quota errors. The old `|| 'unsolved'`
    // already handled this via falsy short-circuit, but the new validator
    // path needs the same observable behavior.
    store['potd:status:POTD0'] = '';
    assert.equal(loadStatus('POTD0'), 'unsolved');
  });
});
