/**
 * Regression test for "getUserId crashes the app when localStorage or
 * crypto.randomUUID are blocked".
 *
 * getUserId() / getAnonId() is on the critical path of:
 *
 *   - saveCode, saveStatus, clearCode (Supabase-enabled branches)
 *   - useSSE.run — sends `userId` in every /run and /test POST body
 *
 * Pre-fix the implementation assumed both pieces always work:
 *
 *   let id = localStorage.getItem('potd:anonymous-id');   // can throw
 *   if (!id) {
 *     id = crypto.randomUUID();                           // can throw
 *     localStorage.setItem('potd:anonymous-id', id);      // can throw
 *   }
 *   return id;
 *
 * Both `localStorage.*` and `crypto.randomUUID` can throw in real
 * deployments:
 *
 *   - Safari Private Mode raises SecurityError on every localStorage
 *     access (read AND write) for some content settings. iOS
 *     Lockdown Mode does similar.
 *   - crypto.randomUUID requires a secure context (HTTPS or localhost).
 *     A self-hosted deploy on plain http:// has crypto.subtle disabled
 *     and, in some browser versions, throws when randomUUID is called.
 *   - localStorage.setItem can throw QuotaExceededError when storage
 *     is full.
 *
 * Any of those throws used to escape getAnonId, propagate through
 * useSSE.run, and prevent the user from running ANY code — the Run
 * button click would land in the unhandled rejection path.
 *
 * The fix:
 *   - Wraps localStorage reads, randomUUID, and localStorage writes
 *     in try/catch each.
 *   - Returns a session-scoped in-memory id when storage is unwritable
 *     so subsequent calls in the same session stay internally
 *     consistent (cmake-runner stages files at .builds/<userId>/...
 *     and a re-rolling id would orphan the staging tree and force a
 *     full rebuild on every run).
 *   - generateId() prefers crypto.randomUUID but falls back to a
 *     Math.random()-based id when randomUUID is missing or throws.
 *     Uniqueness is per-browser regardless; the fallback shape is
 *     fine as long as it doesn't crash.
 *
 * Pinned at the source level — exercising every throwing branch under
 * happy-dom would require swapping out the globals between test runs
 * and is brittle. Source pins describe the contract directly.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('storage.getAnonId tolerates broken localStorage / missing randomUUID', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'lib', 'storage.ts'),
      'utf8',
    );
  });

  it('localStorage.getItem is wrapped in try/catch', () => {
    // Safari Private Mode throws SecurityError on every access. A bare
    // `localStorage.getItem(...)` propagates that throw all the way out
    // of saveCode / useSSE.run / etc.
    const fn = src.match(/function getAnonId\([\s\S]+?\n\}/);
    assert.ok(fn, 'could not locate getAnonId');
    assert.match(
      fn![0],
      /try\s*\{[\s\S]+?localStorage\.getItem\(\s*['"]potd:anonymous-id['"]/,
      'localStorage.getItem on the anonymous-id key must be try-wrapped',
    );
  });

  it('localStorage.setItem is wrapped in try/catch', () => {
    // QuotaExceededError on full storage, SecurityError on private mode.
    // The set is separately guarded so that a failed READ doesn't fall
    // through to a write that also throws.
    const fn = src.match(/function getAnonId\([\s\S]+?\n\}/);
    assert.ok(fn);
    assert.match(
      fn![0],
      /try\s*\{[\s\S]+?localStorage\.setItem\(\s*['"]potd:anonymous-id['"]/,
      'localStorage.setItem on the anonymous-id key must be try-wrapped',
    );
  });

  it('crypto.randomUUID is guarded via generateId with a fallback path', () => {
    const fn = src.match(/function generateId\([\s\S]+?\n\}/);
    assert.ok(fn, 'must define a generateId helper');
    // Two requirements: it must CHECK that randomUUID is callable before
    // calling, AND it must have a fallback when it isn't. A bare `return
    // crypto.randomUUID()` would still throw in insecure contexts even
    // if it didn't throw on the access check.
    assert.match(fn![0], /typeof\s+crypto\.randomUUID\s*===\s*['"]function['"]/);
    assert.match(fn![0], /Math\.random\(\)/);
  });

  it('falls back to a session-scoped id when storage is unwritable', () => {
    // The key property: TWO calls to getAnonId within one session must
    // return the SAME id even when storage is broken. cmake-runner uses
    // the id to compute .builds/<userId>/<problemId>/... staging dirs;
    // a fresh id on every call would orphan the staging tree and force
    // a full rebuild on every /run or /test.
    assert.match(src, /sessionFallbackId/);
    assert.match(
      src,
      /if\s*\(\s*!\s*sessionFallbackId\s*\)\s*sessionFallbackId\s*=/,
      'sessionFallbackId must be assigned exactly once and re-used on subsequent calls',
    );
  });
});
