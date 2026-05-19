import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = globalThis;

import { getStreak, recordSolveDate } from '../lib/storage.js';

// Regression for the calendarDaysApart NaN-propagation bug.
//
// Pre-fix the function did:
//
//   function calendarDaysApart(a: string, b: string): number {
//     const [ay, am, ad] = a.split('-').map(Number);
//     const [by, bm, bd] = b.split('-').map(Number);
//     return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
//   }
//
// On a non-YYYY-MM-DD string, `Number()` on any of the three parts returns
// NaN. NaN flows through subtraction and Math.round unchanged, so the
// function returned NaN for any malformed input — and `NaN === 1` is false,
// so getStreak's `if (calendarDaysApart(...) === 1)` immediately broke out
// of the loop, silently truncating the streak.
//
// `readStringArray` already filtered non-string entries out of
// potd:solve-dates, but it accepted ANY string — including non-date
// strings like 'garbage', a half-written 'YYYY-MM' truncation, an
// extension's clobbering value, or a leftover entry from a build that
// stored dates in a different format. A single bad entry was enough to
// either cut the streak short (if it sorted into the middle of the
// chronological run) or zero the streak entirely (if it sorted to the
// top — string sort puts 'g' > '2', so 'garbage' lands ahead of every
// real date, and `sorted[0] !== today && sorted[0] !== yesterday` then
// returned 0 before the loop even ran).
//
// The fix filters at read time to a strict YYYY-MM-DD regex, both inside
// getStreak so the visible streak is correct and inside recordSolveDate
// so the persisted array gets *healed* on the next solve — leaving the
// garbage in storage would mean every subsequent getStreak() call paid
// the same filtering cost AND a future bug in the filter could expose
// the bad value again.
describe('getStreak ignores malformed entries in potd:solve-dates', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);

  it('returns the full streak when valid dates are contiguous', () => {
    store['potd:solve-dates'] = JSON.stringify([today, yesterday, twoDaysAgo, threeDaysAgo]);
    assert.equal(getStreak(), 4);
  });

  it('returns the full streak when malformed entries are interleaved with valid dates', () => {
    // Pre-fix: 'garbage' sorts above every YYYY-MM-DD string ('g' > '2'
    // in JS string order), so it lands at sorted[0]. The top-of-loop
    // guard `sorted[0] !== today && sorted[0] !== yesterday` then
    // returns 0 immediately, BEFORE the loop runs. So the visible
    // streak was 0, not "1 plus whatever survived the loop".
    store['potd:solve-dates'] = JSON.stringify([today, 'garbage', yesterday, twoDaysAgo]);
    assert.equal(getStreak(), 3);
  });

  it('returns the full streak when a YYYY-MM truncation is interleaved', () => {
    // A half-written value or a leftover from a build that stored
    // year-month only. Both year and month parse cleanly, but `Number(undefined)`
    // is NaN, so the day is NaN → diff is NaN → loop breaks.
    store['potd:solve-dates'] = JSON.stringify([today, '2026-05', yesterday, twoDaysAgo]);
    assert.equal(getStreak(), 3);
  });

  it('returns 0 when the entire array is malformed', () => {
    // All entries get filtered out → dates.length === 0 → existing
    // early-return path. Confirms the filter doesn't accidentally invent
    // a streak out of garbage.
    store['potd:solve-dates'] = JSON.stringify(['totally', 'broken', 'data']);
    assert.equal(getStreak(), 0);
  });

  it('returns 0 when the only valid dates are too old to extend the streak', () => {
    // sorted[0] !== today && sorted[0] !== yesterday triggers the
    // existing early return. The filter must not break this case by
    // accidentally including a recent malformed entry as if it were today.
    store['potd:solve-dates'] = JSON.stringify(['2020-01-01', 'garbage', '2020-01-02']);
    assert.equal(getStreak(), 0);
  });

  it('returns the streak when malformed entries are at the very top of sort order', () => {
    // 'zzzz' sorts above every YYYY-MM-DD string. Pre-fix this hit the
    // sorted[0] guard immediately and returned 0; post-fix the filter
    // drops it before sort and the streak is computed normally.
    store['potd:solve-dates'] = JSON.stringify(['zzzz-99-99', today, yesterday]);
    assert.equal(getStreak(), 2);
  });

  it('returns 1 when only today is valid amid garbage', () => {
    // Single-day streak past the top-of-loop guard. After filtering,
    // sorted is [today], the loop doesn't run, streak stays at 1.
    store['potd:solve-dates'] = JSON.stringify(['garbage', today, 'more-garbage']);
    assert.equal(getStreak(), 1);
  });
});

describe('recordSolveDate heals malformed entries in potd:solve-dates', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('rewrites the array without malformed entries when a new solve is recorded', () => {
    // The filter applies on the WRITE path too, so a single solve clears
    // any accumulated garbage instead of letting it persist indefinitely.
    // This matches the pattern in storage-corruption.spec.ts where
    // recordSolveDate "heals" a corrupt parse into a clean array.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    store['potd:solve-dates'] = JSON.stringify(['garbage', yesterday, 'more-garbage']);
    recordSolveDate();
    const after = JSON.parse(store['potd:solve-dates']);
    assert.ok(Array.isArray(after));
    for (const entry of after) {
      assert.match(entry, /^\d{4}-\d{2}-\d{2}$/, `entry "${entry}" survived but is not YYYY-MM-DD`);
    }
  });

  it('preserves valid prior entries when healing', () => {
    // The malformed-entry filter must not be over-eager. Yesterday's
    // valid date has to survive into the rewritten array so the streak
    // doesn't reset after a heal.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    store['potd:solve-dates'] = JSON.stringify(['garbage', yesterday]);
    recordSolveDate();
    const after = JSON.parse(store['potd:solve-dates']);
    assert.ok(after.includes(yesterday), 'valid yesterday entry should survive the heal');
  });
});
