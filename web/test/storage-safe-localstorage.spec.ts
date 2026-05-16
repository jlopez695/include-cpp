/**
 * Regression test for "every localStorage call in storage.ts is a
 * potential crash under Safari Private Mode / iOS Lockdown / quota".
 *
 * Before this fix, storage.ts had ~12 direct `localStorage.*` calls
 * sprinkled across loadCode, saveCode, clearCode, loadStatus,
 * saveStatus, recordSolveDate, loadBestResult, saveBestResult,
 * toggleBookmark, loadUiState, saveUiState. Each one assumed the
 * call would succeed, but every one of those calls throws under
 * realistic conditions:
 *
 *   - SecurityError under Safari Private Mode + "Block All Cookies"
 *   - SecurityError inside sandboxed iframes
 *   - QuotaExceededError when the user's quota is full
 *
 * The worst spot was useResizable's mouseup handler — it calls
 * saveUiState from inside a global `window.addEventListener('mouseup',
 * ...)`. A throw there escaped the listener, landed as
 * `uncaughtException`, and on a fragile process supervisor could
 * have taken the page down. Less catastrophic but still bad: every
 * Run/Test button click went through getUserId() which called
 * getAnonId() which called localStorage twice → both could throw,
 * the throw bubbled out of useSSE.run before the fetch fired, and
 * the user got a stack trace in the console instead of a test run.
 *
 * The fix introduces three helpers — safeGetItem / safeSetItem /
 * safeRemoveItem — that wrap try/catch around the underlying calls
 * and route every site in this file through them. Reads return null
 * on failure (equivalent to "no value"). Writes/removes silently
 * drop; safeSetItem additionally returns a boolean so callers that
 * care about the durability of the write (e.g. getAnonId switching
 * to its in-memory fallback) can branch on it.
 *
 * This test mocks localStorage to throw on every operation and asserts
 * that the public API surface doesn't crash, returns sensible
 * fallbacks, and getUserId remains stable across calls within the
 * same session even when storage is fully broken.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Install a fully-throwing localStorage BEFORE importing the module
// under test — module-load reads might touch storage.
const throwingStorage = {
  getItem(_key: string): string | null { throw new Error('SecurityError'); },
  setItem(_k: string, _v: string): void { throw new Error('SecurityError'); },
  removeItem(_k: string): void { throw new Error('SecurityError'); },
};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = throwingStorage;

// crypto.randomUUID may or may not exist in Node test environments.
// Force a known-good shape so we test storage's resilience, not the
// host runtime's idiosyncrasies.
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = { randomUUID: () => 'test-uuid-fixed' };
} else if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  (globalThis as any).crypto.randomUUID = () => 'test-uuid-fixed';
}

const storage = await import('../lib/storage.js');

describe('storage.ts public API survives a fully-throwing localStorage', () => {
  beforeEach(() => {
    // Each test starts with the throwing storage installed.
    (globalThis as any).localStorage = throwingStorage;
  });

  it('getUserId returns a non-empty string and is stable across calls', () => {
    let a = '';
    let b = '';
    assert.doesNotThrow(() => { a = storage.getUserId(); });
    assert.doesNotThrow(() => { b = storage.getUserId(); });
    assert.ok(a.length > 0, 'getUserId must produce SOMETHING even with broken storage');
    assert.equal(a, b, 'getUserId must return the same id within a session — cmake staging dirs depend on it');
  });

  it('loadCode returns null instead of throwing', () => {
    let result: string | null = '__set__';
    assert.doesNotThrow(() => { result = storage.loadCode('POTD0', 'hello.cpp'); });
    assert.equal(result, null);
  });

  it('saveCode does not throw on either branch (starter or non-starter content)', () => {
    assert.doesNotThrow(() => storage.saveCode('POTD0', 'hello.cpp', 'fresh content', 'starter content'));
    assert.doesNotThrow(() => storage.saveCode('POTD0', 'hello.cpp', 'starter content', 'starter content'));
  });

  it('clearCode does not throw on the per-file localStorage.removeItem path', () => {
    assert.doesNotThrow(() => storage.clearCode('POTD0', ['hello.cpp', 'other.cpp']));
  });

  it('loadStatus returns the default "unsolved" instead of throwing', () => {
    let result: string = 'solved';
    assert.doesNotThrow(() => { result = storage.loadStatus('POTD0'); });
    assert.equal(result, 'unsolved');
  });

  it('saveStatus does not throw on either branch (unsolved or solved)', () => {
    assert.doesNotThrow(() => storage.saveStatus('POTD0', 'solved', 5, 5));
    assert.doesNotThrow(() => storage.saveStatus('POTD0', 'unsolved', 0, 0));
  });

  it('recordSolveDate / getStreak return defaults instead of throwing', () => {
    assert.doesNotThrow(() => storage.recordSolveDate());
    let streak = -1;
    assert.doesNotThrow(() => { streak = storage.getStreak(); });
    // With broken reads we end up with an empty dates list → streak 0.
    assert.equal(streak, 0);
  });

  it('loadBestResult / saveBestResult do not throw', () => {
    let loaded: ReturnType<typeof storage.loadBestResult> = { passed: 1, total: 1 };
    assert.doesNotThrow(() => { loaded = storage.loadBestResult('POTD0'); });
    assert.equal(loaded, null);
    let saved = true;
    // saveBestResult is the one localStorage helper whose return value
    // changes meaning under the fix: it used to always return true on a
    // new best, now it returns false when the write was dropped. Either
    // way, the call itself must not throw.
    assert.doesNotThrow(() => { saved = storage.saveBestResult('POTD0', 3, 5); });
    assert.equal(saved, false, 'a dropped write should be reflected in the return value, not as a throw');
  });

  it('bookmarks API does not throw', () => {
    let ids: string[] = ['placeholder'];
    assert.doesNotThrow(() => { ids = storage.getBookmarkedIds(); });
    assert.deepEqual(ids, []);
    let bookmarked = true;
    assert.doesNotThrow(() => { bookmarked = storage.isBookmarked('POTD0'); });
    assert.equal(bookmarked, false);
    let newState = true;
    assert.doesNotThrow(() => { newState = storage.toggleBookmark('POTD0'); });
    // Couldn't write, so the toggle didn't persist — getBookmarkedIds()
    // will still return [] next call. The return value reflects what the
    // function thought it did, which is "added to an empty list" → true.
    assert.equal(typeof newState, 'boolean');
  });

  it('loadUiState / saveUiState do not throw (the useResizable mouseup path)', () => {
    let value = 'sentinel';
    assert.doesNotThrow(() => { value = storage.loadUiState('output-height', 'sentinel'); });
    assert.equal(value, 'sentinel', 'loadUiState must return the fallback when storage is broken');

    // saveUiState is the highest-impact unguarded call — useResizable's
    // mouseup handler invokes it from a global window event listener,
    // and an uncaught throw there lands as uncaughtException.
    assert.doesNotThrow(() => storage.saveUiState('output-height', 220));
  });
});
