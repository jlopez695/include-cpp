/**
 * Regression test for "Supabase sync failures vanish silently".
 *
 * The two background syncs in storage.ts — clearCode → user_code delete,
 * and saveStatus → problem_status upsert — used to terminate each chain
 * with `.then(() => {})`, throwing away both the resolved value AND the
 * `{ error }` field that Supabase populates for query-level failures
 * (auth expired, RLS misconfigured, table missing, etc.). localStorage
 * is the source of truth, so the silent failure wasn't catastrophic —
 * but diagnosing "why isn't my progress showing up on the other browser?"
 * required opening DevTools network tab and reading the response body
 * yourself, because nothing surfaced in console.
 *
 * Fix: log the error field via console.warn so failed syncs leave a
 * breadcrumb. The supabase env vars are unset in CI (same constraint as
 * save-code-debounce.spec.ts), so this is a source-level pin rather
 * than a runtime exercise.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('storage.ts Supabase sync error logging', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'lib', 'storage.ts'),
      'utf8',
    );
  });

  it('does not terminate a Supabase chain with .then(() => {}) anywhere', () => {
    // The lesser symptom of the bug: a no-op then that DOES fire the
    // request but discards { error } so failures vanish.
    assert.doesNotMatch(
      src,
      /\.then\(\(\)\s*=>\s*\{\s*\}\s*\)/,
      'a `.then(() => {})` chain swallows the { error } field that ' +
        'Supabase queries resolve with — replace it with .then(({ error }) => ...) ' +
        'so the failure leaves a console.warn breadcrumb.',
    );
  });

  it('does not leave a Supabase builder unconsumed via `void sb.from(...)`', () => {
    // The WORSE symptom (latent regression discovered during this fix):
    // PostgrestBuilder is lazy — the fetch only fires inside .then().
    // `void sb.from('x').upsert(...)` constructs the builder and discards
    // it without ever calling .then, so the HTTP request never goes out
    // and the upsert is silently a no-op. Any `void sb.from(...)` in this
    // file would mean a write is being skipped without the caller knowing.
    // Strip comments before scanning so this assertion isn't triggered by
    // its own explanatory comment in storage.ts.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/([^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(
      code,
      /\bvoid\s+sb\.from\(/,
      '`void sb.from(...)` discards the PostgrestBuilder before its .then ' +
        'is invoked, so the HTTP request never fires. Terminate with ' +
        '.then(({ error }) => ...) instead — that is what triggers the fetch.',
    );
  });

  // For each table chain, locate the builder by anchoring on the specific
  // operation (.delete / .upsert) so we don't accidentally grab a peer.
  function chainAt(table: string, op: 'delete' | 'upsert'): string {
    const pattern = new RegExp(
      `from\\(\\s*'${table}'\\s*\\)[\\s\\S]+?\\.${op}\\([\\s\\S]+?\\.then\\([\\s\\S]+?\\}\\)\\s*;`,
    );
    const m = src.match(pattern);
    assert.ok(m, `${table}.${op} chain (with .then terminator) not located`);
    return m![0];
  }

  it('clearCode user_code delete reads { error } and logs on failure', () => {
    const block = chainAt('user_code', 'delete');
    assert.match(block, /\.then\(\(\s*\{\s*error[^}]*\}\s*\)\s*=>/);
    assert.match(block, /console\.warn\(/);
  });

  it('scheduleSupabaseSave user_code upsert reads { error } and logs on failure', () => {
    const block = chainAt('user_code', 'upsert');
    assert.match(block, /\.then\(\(\s*\{\s*error[^}]*\}\s*\)\s*=>/);
    assert.match(block, /console\.warn\(/);
  });

  it('saveStatus problem_status upsert reads { error } and logs on failure', () => {
    const block = chainAt('problem_status', 'upsert');
    assert.match(block, /\.then\(\(\s*\{\s*error[^}]*\}\s*\)\s*=>/);
    assert.match(block, /console\.warn\(/);
  });
});
