/**
 * Regression test for "an unhandled promise rejection leaks out of every
 * background Supabase sync when getClient() itself can't fulfill".
 *
 * The four background-sync sites in storage.ts (scheduleSupabaseSave,
 * scheduleSupabaseDelete, clearCode, saveStatus) used to write:
 *
 *   void getClient().then(sb => {
 *     if (!sb) return;
 *     sb.from('user_code').upsert(...).then(({ error }) => …);
 *   });
 *
 * The inner `.then(({ error }) => …)` handles SUPABASE-level failures
 * (auth expired, RLS rejection, table missing) by logging a breadcrumb.
 * What it does NOT handle is `getClient()` itself rejecting — which
 * happens in two distinct ways:
 *
 *   1. The dynamic `import('@supabase/ssr')` chunk fails to load. CSPs,
 *      sandboxed iframes, transient network errors mid-session, and a
 *      handful of bundler edge cases all produce this.
 *   2. createBrowserClient() throws synchronously inside the dynamic
 *      import callback (e.g. malformed env vars rolled out together).
 *
 * Both rejections previously escaped `void` and surfaced as
 * `unhandledrejection` on window — visible to anyone listening (Sentry,
 * the dev console, error-overlay UIs). The Supabase sync is
 * fire-and-forget and localStorage is the source of truth, so the right
 * contract is the same one the inner handler already follows: drop a
 * console.warn breadcrumb, otherwise carry on.
 *
 * Like the sibling storage-supabase-warn.spec.ts, this is a structural
 * pin: the supabase env vars are unset in CI, so we can't exercise the
 * timer path end-to-end without a module-loader interception this
 * suite doesn't currently use. The structural test verifies that every
 * outer `getClient().then(…)` chain has a corresponding `.catch(…)`
 * routed through the shared warnClientUnavailable helper, so future
 * regressions (a fifth sync site added without the catch, or someone
 * stripping the catch as "redundant") fail fast.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('storage.ts: getClient() rejection is caught at every sync site', () => {
  let src: string;
  let codeOnly: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'lib', 'storage.ts'),
      'utf8',
    );
    // Strip /* … */ and // … comments so explanatory text doesn't
    // accidentally satisfy or violate the structural assertions below.
    codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/([^:])\/\/.*$/gm, '$1');
  });

  it('defines a shared warnClientUnavailable helper that uses console.warn', () => {
    // One helper, not four inline arrows — keeps the reason for the catch
    // documented in a single place, and makes "is this site catching the
    // outer reject?" a grep-able question.
    const helper = src.match(/function\s+warnClientUnavailable[\s\S]+?\n\}/);
    assert.ok(helper, 'expected a warnClientUnavailable(err) helper to be defined');
    assert.match(
      helper![0],
      /console\.warn\(/,
      'warnClientUnavailable must emit a console.warn breadcrumb',
    );
  });

  it('has no bare `getClient().then(...)` chain without a .catch', () => {
    // The bug shape: any `getClient().then(...)` chain whose outer .then
    // closes WITHOUT a follow-on .catch is an unhandled-rejection escape
    // hatch the moment getClient itself rejects. Walk balanced-paren
    // expressions instead of regexing — the .then callback body contains
    // nested .then / .upsert / .delete calls that a naive `\.then\([^)]+\)`
    // would mis-bound.
    const chains: string[] = [];
    const TOKEN = 'getClient()';
    let i = 0;
    while ((i = codeOnly.indexOf(TOKEN, i)) !== -1) {
      const afterCall = i + TOKEN.length;
      // Skip the chained-method whitespace (newline + indent in the
      // current source layout) between `getClient()` and `.then(`.
      let probe = afterCall;
      while (probe < codeOnly.length && /\s/.test(codeOnly[probe])) probe++;
      if (codeOnly.slice(probe, probe + '.then('.length) !== '.then(') {
        // Not a `.then` chain — skip past this occurrence (defensive; the
        // current source has no such shape, but a future caller might
        // legitimately have `const sb = await getClient();`).
        i = afterCall;
        continue;
      }
      const start = i;
      // Find the matching close paren for `.then(`.
      let depth = 0;
      let j = probe + '.then('.length - 1; // points at the '(' itself
      for (; j < codeOnly.length; j++) {
        const c = codeOnly[j];
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) { j++; break; }
        }
      }
      // Now `j` is just past the closing `)` of `.then(...)`. Skip
      // whitespace to find the follow-on (.catch, semicolon, etc.).
      let k = j;
      while (k < codeOnly.length && /\s/.test(codeOnly[k])) k++;
      const follow = codeOnly.slice(k, k + '.catch'.length);
      chains.push(codeOnly.slice(start, k + '.catch'.length));
      assert.equal(
        follow,
        '.catch',
        `getClient().then(...) at offset ${start} is not followed by .catch — ` +
          `outer rejection would surface as unhandledrejection. ` +
          `Chain head: ${codeOnly.slice(start, Math.min(start + 80, codeOnly.length))}`,
      );
      i = k;
    }
    // Sanity: we found and validated all four expected chains.
    assert.equal(
      chains.length,
      4,
      `expected exactly 4 getClient().then() chains in storage.ts (scheduleSupabaseSave, scheduleSupabaseDelete, clearCode, saveStatus) but found ${chains.length}`,
    );
  });

  it('routes every catch through warnClientUnavailable rather than swallowing', () => {
    // A `.catch(() => {})` would technically suppress unhandledrejection
    // but would also hide a real outage from anyone debugging. Each catch
    // must funnel through the named helper so the breadcrumb is uniform
    // and grep-able.
    const catchCount = (codeOnly.match(/\.catch\(\s*warnClientUnavailable\s*\)/g) ?? []).length;
    assert.equal(
      catchCount,
      4,
      `expected 4 \`.catch(warnClientUnavailable)\` invocations (one per getClient() chain), found ${catchCount}`,
    );
  });
});
