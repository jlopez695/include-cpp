/**
 * Regression test for "saveCode bombards Supabase with a network upsert
 * per keystroke".
 *
 * Before this fix, saveCode wrote to localStorage AND fired a fresh
 * `sb.from('user_code').upsert(...)` round-trip on every Monaco
 * onDidChangeModelContent. At typing speed that meant roughly one
 * network upsert per character — a real bandwidth/latency hit, and on
 * flaky networks the queue of in-flight upserts could starve the
 * actually-interesting traffic (problem loads, /run/test streams).
 *
 * The fix:
 *   - localStorage write stays synchronous so page reload never loses
 *     the most recent character.
 *   - The Supabase upsert is debounced ~500ms per (problemId, filename)
 *     so it fires once the user pauses typing, with the latest content.
 *   - clearCode cancels any pending debounced upsert for the cleared
 *     files; otherwise a pending timer could fire AFTER the .delete()
 *     and re-create the row from pre-reset content.
 *
 * The supabaseEnabled flag is derived from NEXT_PUBLIC_SUPABASE_URL /
 * _ANON_KEY at module load. Those env vars are unset in CI, so we
 * can't exercise the timer path end-to-end. We pin the structural
 * properties of the implementation instead.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('storage.saveCode debounces the Supabase upsert', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'lib', 'storage.ts'),
      'utf8',
    );
  });

  it('defines a debounce delay constant (in ms, > 0)', () => {
    const m = src.match(/SUPABASE_SAVE_DEBOUNCE_MS\s*=\s*(\d+)/);
    assert.ok(m, 'expected SUPABASE_SAVE_DEBOUNCE_MS = <number> to be defined');
    const ms = Number(m![1]);
    assert.ok(ms >= 100 && ms <= 2000, `debounce should be in a sensible range (got ${ms}ms)`);
  });

  it('tracks pending timers in a Map keyed per (problemId, filename)', () => {
    // Map type, not just a single timer — different files must debounce
    // independently so editing file A doesn't delay a flush for file B.
    assert.match(src, /pendingSupabaseSaves\s*=\s*new Map<string,\s*ReturnType<typeof setTimeout>>\(\)/);
    // The schedule helper composes the key from BOTH problem id and filename.
    assert.match(src, /scheduleSupabaseSave[\s\S]{0,400}\$\{problemId\}:\$\{filename\}/);
  });

  it('saveCode no longer issues an inline Supabase upsert', () => {
    // saveCode body must NOT contain `sb.from('user_code').upsert(...)`
    // directly — that would defeat the debounce.
    const saveCodeBody = src.match(/export function saveCode[\s\S]+?\n\}/);
    assert.ok(saveCodeBody, 'could not locate saveCode body');
    assert.doesNotMatch(saveCodeBody![0], /sb\.from\(\s*'user_code'\s*\)\s*\.upsert/);
    // ...and must instead delegate to the scheduler.
    assert.match(saveCodeBody![0], /scheduleSupabaseSave\(/);
  });

  it('scheduleSupabaseSave clears any existing timer for the same key before setting a new one', () => {
    // The coalescing behavior — without clearTimeout on the existing
    // entry, every keystroke would queue a NEW upsert in addition to
    // the prior one, giving us the worst of both worlds (delayed AND
    // duplicated).
    const fn = src.match(/function scheduleSupabaseSave[\s\S]+?\n\}/);
    assert.ok(fn, 'could not locate scheduleSupabaseSave');
    assert.match(fn![0], /clearTimeout\(/);
    assert.match(fn![0], /setTimeout\(/);
  });

  it('clearCode cancels any pending debounced save for the cleared files', () => {
    // Without this, the user could hit Reset, the timer would fire
    // ~500ms later, and the row they just deleted would be recreated
    // with the pre-reset content.
    const clearCodeBody = src.match(/export function clearCode[\s\S]+?\n\}/);
    assert.ok(clearCodeBody, 'could not locate clearCode body');
    assert.match(clearCodeBody![0], /cancelPendingSupabaseSave\(/);
  });
});
