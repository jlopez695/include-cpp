import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Direct module exercise — the storage helpers don't need a DOM, only
// localStorage. Mirrors the setup used by load-ui-state-type-validation.spec.ts
// and streak-malformed-date.spec.ts in this directory.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

(globalThis as { window?: unknown }).window = { localStorage: mockLocalStorage };
(globalThis as { localStorage?: unknown }).localStorage = mockLocalStorage;

const { loadBestResult, saveBestResult } = await import('../lib/storage.ts');

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('loadBestResult rejects non-finite numeric fields', () => {
  it('returns null when passed is the JSON-roundtripped NaN sentinel (null)', () => {
    // JSON.stringify({passed: NaN, total: 5}) emits {"passed":null,"total":5},
    // which is the realistic on-disk shape after a buggy writer hit the path.
    // typeof null === 'object', so the old guard's `typeof passed === 'number'`
    // check correctly rejected this case — but the bug is that the *writer*
    // produced this shape silently. The reader's job is to make sure it never
    // accidentally returns a non-finite number to callers, so we also cover
    // the cases where a non-numeric value sits in a passed/total slot.
    store['cpp:best:p1'] = JSON.stringify({ passed: null, total: 5 });
    assert.equal(loadBestResult('p1'), null);
  });

  it('returns null when total is null', () => {
    store['cpp:best:p2'] = JSON.stringify({ passed: 3, total: null });
    assert.equal(loadBestResult('p2'), null);
  });

  it('returns null when passed is Infinity (manual devtools edit)', () => {
    // Infinity isn't valid JSON either, but a devtools-typed value can plant
    // a string the parser will choke on. Use a non-finite *number*
    // injected directly through a manual setItem to simulate the worst case.
    store['cpp:best:p3'] = '{"passed":1e9999,"total":5}';
    // JSON.parse converts 1e9999 to Infinity. typeof Infinity === 'number',
    // so the old guard let it through. The fix uses Number.isFinite.
    assert.equal(loadBestResult('p3'), null);
  });

  it('returns null when total is Infinity', () => {
    store['cpp:best:p4'] = '{"passed":3,"total":1e9999}';
    assert.equal(loadBestResult('p4'), null);
  });

  it('returns null when passed is a string (manual devtools edit)', () => {
    store['cpp:best:p5'] = JSON.stringify({ passed: '3', total: 5 });
    assert.equal(loadBestResult('p5'), null);
  });

  it('returns the value on the happy path', () => {
    store['cpp:best:ok'] = JSON.stringify({ passed: 3, total: 5 });
    assert.deepEqual(loadBestResult('ok'), { passed: 3, total: 5 });
  });

  it('returns null when no entry exists', () => {
    assert.equal(loadBestResult('missing'), null);
  });
});

describe('saveBestResult rejects non-finite inputs instead of silently corrupting storage', () => {
  it('returns false when passed is NaN and does not write', () => {
    // The realistic failure: an upstream calculation produces NaN (a division
    // by zero in a results aggregator, a misread of a test result count), and
    // it lands here. Before the fix, JSON.stringify converted NaN to null and
    // overwrote the existing valid entry — a destructive silent corruption.
    store['cpp:best:p1'] = JSON.stringify({ passed: 3, total: 5 });
    const wrote = saveBestResult('p1', NaN, 5);
    assert.equal(wrote, false);
    // The previously-valid entry must remain intact, *not* be clobbered to
    // {"passed":null,"total":5}. This is the heart of the bug.
    assert.deepEqual(JSON.parse(store['cpp:best:p1']), { passed: 3, total: 5 });
  });

  it('returns false when total is NaN and does not write', () => {
    store['cpp:best:p2'] = JSON.stringify({ passed: 3, total: 5 });
    const wrote = saveBestResult('p2', 4, NaN);
    assert.equal(wrote, false);
    assert.deepEqual(JSON.parse(store['cpp:best:p2']), { passed: 3, total: 5 });
  });

  it('returns false when passed is Infinity', () => {
    const wrote = saveBestResult('p3', Infinity, 5);
    assert.equal(wrote, false);
    assert.equal(store['cpp:best:p3'], undefined);
  });

  it('returns false when total is -Infinity', () => {
    const wrote = saveBestResult('p4', 3, -Infinity);
    assert.equal(wrote, false);
    assert.equal(store['cpp:best:p4'], undefined);
  });

  it('writes on the happy path', () => {
    const wrote = saveBestResult('ok', 3, 5);
    assert.equal(wrote, true);
    assert.deepEqual(JSON.parse(store['cpp:best:ok']), { passed: 3, total: 5 });
  });
});
