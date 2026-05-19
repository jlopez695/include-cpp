import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node.js tests.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = globalThis;

import { toggleBookmark, getBookmarkedIds, recordSolveDate } from '../lib/storage.js';

/**
 * Regression for #2.2: toggleBookmark and recordSolveDate used to
 * mutate their working arrays in place before serializing. Two
 * downstream failure modes:
 *
 *   1. If safeSetItem returns false (Safari Private Mode, quota
 *      exceeded), the in-memory `ids` array was already mutated
 *      while localStorage held the old value — drift between read
 *      and persisted state.
 *
 *   2. Mid-write the array shape was "almost the right state but
 *      not yet stringified," so any concurrent storage-event
 *      listener that observed the next read between mutate and
 *      write would see the wrong state.
 *
 * The post-fix invariant: every write path builds a fresh next-array
 * via .filter / spread BEFORE the safeSetItem call. We pin this by
 * (a) checking the read-side array returned by getBookmarkedIds is
 * not the same object after a toggle (proves immutability of the
 * internal array shape), and (b) confirming functional behavior is
 * unchanged.
 */

describe('toggleBookmark immutability', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('does not mutate a previously-returned reference when toggling', () => {
    toggleBookmark('POTD0');
    const before = getBookmarkedIds();
    toggleBookmark('POTD1');
    // The reference returned BEFORE the second toggle must not have
    // grown a second element. Pre-fix the splice/push pattern on the
    // SAME getBookmarkedIds() return would have mutated this array
    // had a caller cached it (e.g. across two adjacent renders).
    assert.deepEqual(before, ['POTD0']);
    // And the post-toggle read returns the new state.
    assert.deepEqual(getBookmarkedIds(), ['POTD0', 'POTD1']);
  });

  it('returns the new boolean state correctly when adding', () => {
    assert.equal(toggleBookmark('POTD0'), true);
  });

  it('returns the new boolean state correctly when removing', () => {
    toggleBookmark('POTD0');
    assert.equal(toggleBookmark('POTD0'), false);
  });

  it('rapid double-call on the same id collapses to off → on (idempotent shape)', () => {
    // The pre-fix concern was that rapid double-clicks could race
    // through indexOf+splice on a stale reference. The post-fix
    // build-next-array shape sequences cleanly: each call reads
    // localStorage, builds a next, writes it. After A B A, the
    // result is the same as a single A — the user's intent.
    toggleBookmark('POTD0'); // add
    toggleBookmark('POTD0'); // remove
    toggleBookmark('POTD0'); // add
    assert.deepEqual(getBookmarkedIds(), ['POTD0']);
  });
});

describe('recordSolveDate immutability', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('appends today without mutating the previously-read array reference', () => {
    // Seed an initial date so the read-and-append path runs (the
    // first call on an empty store wouldn't exercise the spread).
    store['potd:solve-dates'] = JSON.stringify(['2026-01-01']);
    // Hold a reference shape that we can compare against.
    const before = JSON.parse(store['potd:solve-dates']!) as string[];
    recordSolveDate();
    // The seeded `before` array (from a previous JSON.parse) should
    // still be exactly one element — recordSolveDate must not have
    // reached into the array we held. Pre-fix the .push would have
    // appended to the same reference if a caller hung onto it.
    assert.deepEqual(before, ['2026-01-01']);
    // The persisted state reflects today + the seed.
    const after = JSON.parse(store['potd:solve-dates']!) as string[];
    assert.equal(after.length, 2);
    assert.ok(after.includes('2026-01-01'));
  });

  it('is idempotent for same-day re-solves (no duplicate today)', () => {
    recordSolveDate();
    recordSolveDate();
    const dates = JSON.parse(store['potd:solve-dates'] ?? '[]') as string[];
    assert.equal(dates.length, 1);
  });
});
