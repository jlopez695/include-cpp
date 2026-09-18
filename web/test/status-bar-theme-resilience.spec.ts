/**
 * Regression test for "StatusBar's theme code throws on every
 * localStorage operation when the browser blocks storage".
 *
 * After the af0339e refactor that routed every localStorage call in
 * `web/lib/storage.ts` through safe wrappers, StatusBar.tsx was the
 * only remaining file (outside of layout.tsx's inline init script)
 * that touched `localStorage.*` directly. It had two such call sites:
 *
 *   useEffect(() => {
 *     const saved = localStorage.getItem('cpp:theme');  // can throw
 *     ...
 *   }, []);
 *
 *   const toggleTheme = () => {
 *     ...
 *     localStorage.setItem('cpp:theme', 'dark');         // can throw
 *     localStorage.setItem('cpp:theme', 'light');        // can throw
 *   };
 *
 * Under Safari Private Mode and sandboxed-iframe contexts the
 * SecurityError propagates out of both call sites. For the mount
 * useEffect that means a React mount-time error on every page load
 * (the FOUC-fix inline script in layout.tsx already handled the
 * class — it's the SECOND read here that broke). For the toggle
 * button it meant the user could still toggle visually but the
 * onClick handler threw a stack trace each time.
 *
 * The fix wraps both call sites in try/catch:
 *   - the mount read falls back to "no saved value" (default dark).
 *   - the toggle write proceeds with the class change (the visible
 *     effect) and silently drops the persist step.
 *
 * Pinned at the source level — exercising both throw paths under
 * happy-dom would require swapping the globals between tests; the
 * structural pins describe the contract directly.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('StatusBar theme handling tolerates a blocked localStorage', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'StatusBar.tsx'),
      'utf8',
    );
  });

  it('the mount-time localStorage.getItem read is try/catch-wrapped', () => {
    // Locate the useEffect that reads cpp:theme on mount. The whole
    // try block must contain BOTH the getItem call AND the class
    // application — otherwise a throw inside getItem leaves the page
    // in an inconsistent half-applied state.
    assert.match(
      src,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?try\s*\{[\s\S]*?localStorage\.getItem\(\s*['"]cpp:theme['"][\s\S]*?\}\s*catch/,
      'StatusBar mount useEffect must wrap its localStorage.getItem call in try/catch',
    );
  });

  it('the toggle handler keeps the class change OUTSIDE the try', () => {
    // The visible part of the toggle (classList.add / remove) is the
    // load-bearing effect for the user — they clicked the button and
    // expect the theme to change. The localStorage persist step is
    // best-effort. So the try MUST wrap only the setItem call, not the
    // classList manipulation. If both go inside the try and getItem
    // throws BEFORE the class change, the user clicks Theme and
    // nothing visible happens.
    const toggleBody = src.match(/const\s+toggleTheme\s*=[\s\S]+?\n\s*\};/);
    assert.ok(toggleBody, 'could not locate toggleTheme body');
    const body = toggleBody![0];

    // classList changes must appear BEFORE the try block.
    const classIdx = body.indexOf('classList');
    const tryIdx = body.indexOf('try {');
    assert.ok(classIdx >= 0, 'toggleTheme must still mutate documentElement.classList');
    assert.ok(tryIdx >= 0, 'toggleTheme must guard the persist step with try/catch');
    assert.ok(
      classIdx < tryIdx,
      'classList mutations must run BEFORE the try block — otherwise a SecurityError in setItem leaves the visible theme un-toggled',
    );
  });

  it('the toggle handler try block wraps localStorage.setItem with both branches', () => {
    // Don't break the existing two-branch persist into something that
    // accidentally drops one. The fix uses a single setItem call with
    // a ternary, so this pin doesn't enforce the exact shape — only
    // that setItem('cpp:theme', ...) lives inside the try and the
    // catch is present.
    const toggleBody = src.match(/const\s+toggleTheme\s*=[\s\S]+?\n\s*\};/);
    assert.ok(toggleBody);
    assert.match(
      toggleBody![0],
      /try\s*\{[\s\S]*?localStorage\.setItem\(\s*['"]cpp:theme['"][\s\S]*?\}\s*catch/,
      'toggleTheme must wrap localStorage.setItem in try/catch',
    );
  });
});
