/**
 * Regression test for "Copy button can leak unhandled promise rejections
 * and crashes on insecure-origin browsers".
 *
 * Two places call navigator.clipboard.writeText from a click handler:
 *
 *   - OutputPanel.handleCopy        (run/test output panel header)
 *   - ProblemDescription per-<pre>   (code block copy button)
 *
 * Both originally did:
 *   navigator.clipboard.writeText(text).then(...)
 *
 * with no rejection handler and no guard on `navigator.clipboard`
 * being defined. Three failure modes hit users:
 *
 *   1. http:// or file:// origins (not localhost) drop
 *      navigator.clipboard entirely. The `.writeText` access throws
 *      synchronously with a TypeError. The button's onClick aborts
 *      mid-execution.
 *
 *   2. Permission denied (Safari prompt declined, document not focused,
 *      iframe without allow="clipboard-write"). writeText resolves to
 *      a rejected promise. The unhandled rejection surfaces as a
 *      console error every click, but the user sees no feedback.
 *
 *   3. Firefox occasionally rejects on tab-not-active.
 *
 * The fix:
 *   - Guard: bail early if `typeof navigator === 'undefined' || !navigator.clipboard`.
 *   - Reject handler: pass a second arg to .then() so rejections are
 *     consumed. The button silently doesn't change to "Copied!" on
 *     failure, which matches the user's intuition (they can still
 *     select + Cmd-C manually).
 *
 * The supabase-warn pattern (no bare .then(() => {}) suppressing the
 * error field) doesn't apply here — clipboard rejections carry nothing
 * actionable, and a console.warn per Copy click would be noise.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');
}

describe('Clipboard writeText callers handle missing/rejected navigator.clipboard', () => {
  describe('OutputPanel.handleCopy', () => {
    let src: string;
    before(() => { src = read('components/OutputPanel.tsx'); });

    it('bails when navigator.clipboard is unavailable (insecure-origin guard)', () => {
      const body = src.match(/handleCopy\s*=\s*\(\)\s*=>\s*\{[\s\S]+?\n\s*\};/);
      assert.ok(body, 'could not locate handleCopy body');
      assert.match(
        body![0],
        /typeof\s+navigator\s*===\s*['"]undefined['"][\s\S]+?!\s*navigator\.clipboard/,
        'handleCopy must short-circuit when navigator.clipboard is absent — otherwise writeText() throws synchronously on http:// and file:// origins',
      );
    });

    it('passes a rejection handler to .then so failed writes do not surface as unhandled', () => {
      const body = src.match(/handleCopy\s*=\s*\(\)\s*=>\s*\{[\s\S]+?\n\s*\};/);
      assert.ok(body);
      // Two-arg .then(onFulfilled, onRejected) OR a .catch — either is fine.
      const hasTwoArgThen = /\.then\(\s*\([^)]*\)\s*=>\s*\{[\s\S]+?\}\s*,\s*\(/.test(body![0]);
      const hasCatch = /\.catch\(/.test(body![0]);
      assert.ok(
        hasTwoArgThen || hasCatch,
        'handleCopy must consume the writeText promise rejection (two-arg .then or .catch); a bare .then() leaves rejections unhandled',
      );
    });
  });

  describe('ProblemDescription per-<pre> copy button', () => {
    let src: string;
    before(() => { src = read('components/ProblemDescription.tsx'); });

    it('bails when navigator.clipboard is unavailable', () => {
      assert.match(
        src,
        /typeof\s+navigator\s*===\s*['"]undefined['"][\s\S]+?!\s*navigator\.clipboard/,
        'per-pre copy must short-circuit when navigator.clipboard is absent',
      );
    });

    it('passes a rejection handler so failures do not surface as unhandled', () => {
      // Grab the inner copy handler — the `const handler = () => { ... };`
      // inside the wire() function.
      const handlerBody = src.match(/const handler\s*=\s*\(\)\s*=>\s*\{[\s\S]+?\n\s*\};/);
      assert.ok(handlerBody, 'could not locate per-pre copy handler');
      const hasTwoArgThen = /\.then\(\s*\([^)]*\)\s*=>\s*\{[\s\S]+?\}\s*,\s*\(/.test(handlerBody![0]);
      const hasCatch = /\.catch\(/.test(handlerBody![0]);
      assert.ok(
        hasTwoArgThen || hasCatch,
        'per-pre copy must consume writeText rejections',
      );
    });

    it('reads text from the inner <code> in preference to <pre>.textContent', () => {
      // Defensive note from the source: pre.textContent walks descendants
      // including the copy button itself, so the fallback would copy
      // "...code...Copy" if a <pre> ever lacks an inner <code>. The
      // querySelector('code') path must come first.
      assert.match(src, /pre\.querySelector\(\s*['"]code['"]\s*\)/);
      // And the fallback chain must be `code?.textContent ?? pre.textContent`,
      // NOT the other way around (which would always include the button).
      assert.match(src, /code\?\.textContent\s*\?\?\s*pre\.textContent/);
    });
  });
});
