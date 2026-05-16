import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Mock localStorage for Node.js tests
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

// Patch global before importing
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = globalThis;

import { recordSolveDate, getStreak, loadStatus } from '../lib/storage.js';

describe('SSR safety (hydration fix)', () => {
  // The hydration bug was caused by loadStatus/getStreak reading localStorage
  // during server render, producing different HTML than the client. The fix:
  // these functions must return safe defaults when window is undefined.

  it('loadStatus returns "unsolved" when window is undefined', () => {
    const saved = globalThis.window;
    delete (globalThis as any).window;
    try {
      assert.equal(loadStatus('any-problem'), 'unsolved');
    } finally {
      (globalThis as any).window = saved;
    }
  });

  it('getStreak returns 0 when window is undefined', () => {
    const saved = globalThis.window;
    delete (globalThis as any).window;
    try {
      assert.equal(getStreak(), 0);
    } finally {
      (globalThis as any).window = saved;
    }
  });

  it('recordSolveDate is a no-op when window is undefined', () => {
    store['potd:solve-dates'] = JSON.stringify(['2025-01-01']);
    const saved = globalThis.window;
    delete (globalThis as any).window;
    try {
      recordSolveDate(); // should not throw or modify store
    } finally {
      (globalThis as any).window = saved;
    }
    // store should be unchanged — the function was a no-op
    assert.deepEqual(JSON.parse(store['potd:solve-dates']), ['2025-01-01']);
  });

  it('loadStatus returns "unsolved" even when localStorage has data but window is gone', () => {
    store['potd:status:POTD0'] = 'solved';
    const saved = globalThis.window;
    delete (globalThis as any).window;
    try {
      assert.equal(loadStatus('POTD0'), 'unsolved');
    } finally {
      (globalThis as any).window = saved;
    }
  });
});

describe('streak tracking', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('returns 0 streak when no solves recorded', () => {
    assert.equal(getStreak(), 0);
  });

  it('records a solve date and returns streak of 1', () => {
    recordSolveDate();
    assert.equal(getStreak(), 1);
  });

  it('does not duplicate same-day solves', () => {
    recordSolveDate();
    recordSolveDate();
    const dates = JSON.parse(store['potd:solve-dates']);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(dates.filter((d: string) => d === today).length, 1);
  });

  it('returns correct streak for consecutive days', () => {
    const today = new Date();
    const dates = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }
    store['potd:solve-dates'] = JSON.stringify(dates);
    assert.equal(getStreak(), 5);
  });

  it('returns 0 streak if most recent solve was 2+ days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    store['potd:solve-dates'] = JSON.stringify([twoDaysAgo]);
    assert.equal(getStreak(), 0);
  });

  it('counts streak starting from yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dayBefore = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    store['potd:solve-dates'] = JSON.stringify([dayBefore, yesterday]);
    assert.equal(getStreak(), 2);
  });

  it('breaks streak at gaps', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // Skip a day, then have an older one
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    store['potd:solve-dates'] = JSON.stringify([threeDaysAgo, yesterday, today]);
    assert.equal(getStreak(), 2); // only yesterday + today
  });
});

describe('streak is stable across DST transitions', () => {
  // The bug this guards against: getStreak() used to parse each stored
  // date with `new Date('YYYY-MM-DDT00:00:00')` — a local-time Date — and
  // diff the milliseconds. On spring-forward, two consecutive calendar
  // days produce a 23-hour diff (≈0.958); on fall-back, 25 hours
  // (≈1.042). Either way `diff === 1` is false and the streak snaps for
  // any user in a DST-observing timezone (~half the planet).
  //
  // We can't deterministically set the runtime TZ here (V8 caches it
  // before tests run), so we verify the fix two ways:
  //   1. A source-text guard that the implementation no longer uses the
  //      buggy local-time Date(str + 'T00:00:00') pattern.
  //   2. A behavior test that pins Date.now() to a date AFTER a known
  //      DST week and stores solves through it. With the fix's Date.UTC
  //      arithmetic, the result is TZ-independent and the streak is
  //      counted correctly; the broken code returned a shorter streak
  //      when this same test ran in America/Los_Angeles.

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('source no longer uses local-time Date(str+T00:00:00) for diffs', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/storage.ts', import.meta.url)), 'utf8');
    // Local-time midnight parse was the bug source; ensure it's gone
    // from the streak path. (Unrelated UTC uses elsewhere are fine.)
    assert.doesNotMatch(src, /new Date\(\s*sorted\[/);
    // And ensure the fix's UTC-based helper exists and is used.
    assert.match(src, /Date\.UTC\(/);
    assert.match(src, /calendarDaysApart/);
  });

  it('counts a US-DST spring-forward week as 4 consecutive days', () => {
    // March 8 2026 is US spring-forward. Mock today to March 11 so the
    // most-recent solve (Mar 10) is "yesterday" and the loop walks back
    // across the DST boundary at Mar 8.
    const realNow = Date.now;
    const realDate = globalThis.Date;
    class MockDate extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2026-03-11T12:00:00Z');
        } else {
          // @ts-expect-error spread to Date constructor
          super(...args);
        }
      }
      static now() { return realDate.parse('2026-03-11T12:00:00Z'); }
    }
    (globalThis as any).Date = MockDate;
    try {
      store['potd:solve-dates'] = JSON.stringify([
        '2026-03-07', // before DST
        '2026-03-08', // DST transition day
        '2026-03-09', // after DST
        '2026-03-10', // yesterday (relative to mocked today)
      ]);
      assert.equal(getStreak(), 4);
    } finally {
      (globalThis as any).Date = realDate;
      Date.now = realNow;
    }
  });

  it('counts a US-DST fall-back week as 4 consecutive days', () => {
    // November 1 2026 is US fall-back. The buggy code computed a 25h
    // diff across this boundary, which also isn't === 1.
    const realDate = globalThis.Date;
    const realNow = Date.now;
    class MockDate extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2026-11-04T12:00:00Z');
        } else {
          // @ts-expect-error spread to Date constructor
          super(...args);
        }
      }
      static now() { return realDate.parse('2026-11-04T12:00:00Z'); }
    }
    (globalThis as any).Date = MockDate;
    try {
      store['potd:solve-dates'] = JSON.stringify([
        '2026-10-31',
        '2026-11-01', // DST transition day
        '2026-11-02',
        '2026-11-03', // yesterday
      ]);
      assert.equal(getStreak(), 4);
    } finally {
      (globalThis as any).Date = realDate;
      Date.now = realNow;
    }
  });
});
