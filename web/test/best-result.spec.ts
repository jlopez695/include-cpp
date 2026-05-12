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

import { saveBestResult, loadBestResult } from '../lib/storage.js';

describe('best result tracking', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('returns null when no result exists', () => {
    assert.equal(loadBestResult('POTD0'), null);
  });

  it('saves initial result', () => {
    const saved = saveBestResult('POTD0', 3, 5);
    assert.equal(saved, true);
    assert.deepEqual(loadBestResult('POTD0'), { passed: 3, total: 5 });
  });

  it('updates when improvement occurs', () => {
    saveBestResult('POTD0', 3, 5);
    const saved = saveBestResult('POTD0', 4, 5);
    assert.equal(saved, true);
    assert.deepEqual(loadBestResult('POTD0'), { passed: 4, total: 5 });
  });

  it('does not overwrite with worse result', () => {
    saveBestResult('POTD0', 4, 5);
    const saved = saveBestResult('POTD0', 2, 5);
    assert.equal(saved, false);
    assert.deepEqual(loadBestResult('POTD0'), { passed: 4, total: 5 });
  });

  it('does not overwrite with equal result', () => {
    saveBestResult('POTD0', 3, 5);
    const saved = saveBestResult('POTD0', 3, 5);
    assert.equal(saved, false);
  });

  it('updates when total changes (new tests added)', () => {
    saveBestResult('POTD0', 3, 3);
    const saved = saveBestResult('POTD0', 3, 5);
    assert.equal(saved, true);
    assert.deepEqual(loadBestResult('POTD0'), { passed: 3, total: 5 });
  });
});
