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

import { toggleBookmark, isBookmarked, getBookmarkedIds } from '../lib/storage.js';

describe('bookmarks', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('returns empty array when no bookmarks exist', () => {
    assert.deepEqual(getBookmarkedIds(), []);
  });

  it('isBookmarked returns false for non-bookmarked problem', () => {
    assert.equal(isBookmarked('POTD0'), false);
  });

  it('toggleBookmark adds a bookmark and returns true', () => {
    const result = toggleBookmark('POTD0');
    assert.equal(result, true);
    assert.equal(isBookmarked('POTD0'), true);
    assert.deepEqual(getBookmarkedIds(), ['POTD0']);
  });

  it('toggleBookmark removes a bookmark and returns false', () => {
    toggleBookmark('POTD0'); // add
    const result = toggleBookmark('POTD0'); // remove
    assert.equal(result, false);
    assert.equal(isBookmarked('POTD0'), false);
    assert.deepEqual(getBookmarkedIds(), []);
  });

  it('handles multiple bookmarks', () => {
    toggleBookmark('POTD0');
    toggleBookmark('POTD1');
    toggleBookmark('POTD2');
    assert.deepEqual(getBookmarkedIds(), ['POTD0', 'POTD1', 'POTD2']);
    assert.equal(isBookmarked('POTD1'), true);
    assert.equal(isBookmarked('POTD3'), false);
  });

  it('removing one bookmark does not affect others', () => {
    toggleBookmark('POTD0');
    toggleBookmark('POTD1');
    toggleBookmark('POTD0'); // remove
    assert.deepEqual(getBookmarkedIds(), ['POTD1']);
    assert.equal(isBookmarked('POTD0'), false);
    assert.equal(isBookmarked('POTD1'), true);
  });
});
