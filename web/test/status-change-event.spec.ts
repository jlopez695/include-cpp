/**
 * Regression test for "Sidebar status dot stays stale after solving the
 * currently-active problem".
 *
 * Sidebar.tsx loads each problem's status from localStorage once via a
 * useEffect with [problems, statusOverrides] deps. SidebarWrapper never
 * passes statusOverrides, so when useProblemEditor's onDone calls
 * saveStatus on the active problem, neither dep changes and the
 * sidebar's status state never refreshes — the dot stays gray (or stays
 * partial) until the user navigates away and back, or hard-reloads.
 *
 * The fix: saveStatus dispatches a `cpp:status-change` CustomEvent on
 * window after writing localStorage; Sidebar listens for it and patches
 * the row inline. recordSolveDate does the same with
 * `cpp:streak-change` for the footer streak badge.
 *
 * This file tests both layers:
 *   1. storage.ts actually dispatches the event with the right payload
 *      (behavioral test against a localStorage shim).
 *   2. Sidebar.tsx wires a listener to STATUS_CHANGE_EVENT, the
 *      StreakBadge listens for STREAK_CHANGE_EVENT, and saveStatus /
 *      recordSolveDate are still the dispatchers (source-text checks
 *      that guard against the listener being removed but the event
 *      kept).
 */
import { describe, it, beforeEach, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Minimal browser shims so the storage module is loadable in node:test.
// Use a real EventTarget so storage.dispatchOnWindow has a working
// dispatchEvent / addEventListener pair to talk to.
const store: Record<string, string> = {};
const eventBus = new EventTarget();
const fakeWindow = Object.assign(eventBus, {
  localStorage: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  },
});
(globalThis as any).window = fakeWindow;
(globalThis as any).localStorage = fakeWindow.localStorage;

import {
  saveStatus,
  recordSolveDate,
  STATUS_CHANGE_EVENT,
  STREAK_CHANGE_EVENT,
  type StatusChangeDetail,
} from '../lib/storage.js';

describe('storage dispatches custom events on status / streak changes', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('saveStatus fires STATUS_CHANGE_EVENT with the problem id and new status', () => {
    const received: StatusChangeDetail[] = [];
    const handler = (e: Event) => {
      const d = (e as CustomEvent<StatusChangeDetail>).detail;
      if (d) received.push(d);
    };
    window.addEventListener(STATUS_CHANGE_EVENT, handler);
    try {
      saveStatus('POTD0', 'solved', 5, 5);
      saveStatus('POTD1', 'attempted', 2, 5);
    } finally {
      window.removeEventListener(STATUS_CHANGE_EVENT, handler);
    }

    assert.deepEqual(received, [
      { problemId: 'POTD0', status: 'solved' },
      { problemId: 'POTD1', status: 'attempted' },
    ]);
  });

  it('saveStatus fires the event even when transitioning to "unsolved" (so a row can clear)', () => {
    let last: StatusChangeDetail | null = null;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<StatusChangeDetail>).detail;
      if (d) last = d;
    };
    window.addEventListener(STATUS_CHANGE_EVENT, handler);
    try {
      saveStatus('POTD0', 'unsolved', 0, 0);
    } finally {
      window.removeEventListener(STATUS_CHANGE_EVENT, handler);
    }
    assert.deepEqual(last, { problemId: 'POTD0', status: 'unsolved' });
  });

  it('recordSolveDate fires STREAK_CHANGE_EVENT only when a new date is added', () => {
    let count = 0;
    const handler = () => { count++; };
    window.addEventListener(STREAK_CHANGE_EVENT, handler);
    try {
      recordSolveDate(); // first call today: mutates, should fire
      recordSolveDate(); // same-day re-solve: no mutation, no fire
      recordSolveDate(); // same again, still no fire
    } finally {
      window.removeEventListener(STREAK_CHANGE_EVENT, handler);
    }
    assert.equal(count, 1, 'expected exactly one streak-change event for one new solve date');
  });
});

describe('Sidebar wires listeners for the status / streak events', () => {
  let sidebarSrc: string;
  before(() => {
    sidebarSrc = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'Sidebar.tsx'),
      'utf8',
    );
  });

  it('imports the event constants from @/lib/storage (no string-literal drift)', () => {
    assert.match(sidebarSrc, /STATUS_CHANGE_EVENT/);
    assert.match(sidebarSrc, /STREAK_CHANGE_EVENT/);
    // The event names must be imported, not hardcoded as strings,
    // because the constants are the public surface storage.ts exports.
    assert.match(sidebarSrc, /from\s+['"]@\/lib\/storage['"]/);
  });

  it('registers an addEventListener for STATUS_CHANGE_EVENT and cleans it up', () => {
    assert.match(sidebarSrc, /addEventListener\(\s*STATUS_CHANGE_EVENT/);
    assert.match(sidebarSrc, /removeEventListener\(\s*STATUS_CHANGE_EVENT/);
  });

  it('StreakBadge re-reads getStreak() from a STREAK_CHANGE_EVENT listener', () => {
    // The whole point is the streak count actually re-renders mid-session.
    const streakSection = sidebarSrc.match(/function StreakBadge[\s\S]+?\n\}/);
    assert.ok(streakSection, 'expected a StreakBadge component in Sidebar.tsx');
    assert.match(streakSection![0], /addEventListener\(\s*STREAK_CHANGE_EVENT/);
    assert.match(streakSection![0], /getStreak\(\)/);
  });
});
