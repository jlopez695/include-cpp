import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

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

import { recordSolveDate, getStreak } from '../lib/storage.js';

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
