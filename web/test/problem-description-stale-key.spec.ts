import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for #2.1: ProblemDescription used to set
 * `key={html.slice(0, 50)}` on its root div. Two problems whose
 * markdown starts with the same 50 characters (very common —
 * problems share intro templates like `# Problem ...\n\nWrite a
 * function that ...`) got the SAME key, React skipped the
 * remount, and the [html]-dependent effect re-ran cleanup against
 * stale DOM nodes that dangerouslySetInnerHTML had already
 * replaced — producing leaked DOM and duplicate copy buttons on
 * subsequent renders.
 *
 * Source-level pin: the explicit `key=` prop must NOT appear on the
 * rendered div. The parent route remounts on problem id change
 * already; the effect's `[html]` dependency handles same-component
 * html updates. We assert on the file contents because rendering
 * the component in jsdom would require Monaco and Next runtime
 * shims, and the regression is exactly "this prop should not be
 * there."
 */

const root = path.join(import.meta.dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'components/ProblemDescription.tsx'),
  'utf8',
);

describe('ProblemDescription: no slice-based remount key', () => {
  it('does not key the rendered div on html.slice(...)', () => {
    // The pre-fix substring was specifically `key={html.slice(0, 50)}`
    // as a JSX prop on the rendered div. Strip line and block comments
    // before searching so the explanatory comment that references the
    // old shape (intentionally kept as a breadcrumb) does not trip
    // the regex. Anything that survives the strip-pass is *live code*
    // — if `key={html.slice(...)}` reappears there, the prefix-
    // collision remount bug is back.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(
      !/key=\{html\.slice\(/.test(stripped),
      'ProblemDescription should not key on a prefix of html — prefix-collision causes stale remounts',
    );
  });

  it('still scopes its effect by [html] so html changes re-run the wire pass', () => {
    // Sanity guardrail: the effect's dependency array on `[html]` is
    // the mechanism that REPLACES the dropped key — if a future
    // refactor accidentally removed it, html-only updates would
    // never re-wire the copy buttons. Pin the dependency literal so
    // the trade-off documented in the post-fix comment stays honest.
    assert.match(source, /\}\s*,\s*\[html\]\s*\)/);
  });
});
