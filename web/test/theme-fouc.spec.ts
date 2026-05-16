/**
 * Regression test for "Dark → light flash on every page load for users
 * with a saved light-mode preference (FOUC)."
 *
 * Before this fix, theme initialization lived in StatusBar's mount
 * useEffect: it would read `localStorage.getItem('potd:theme')` after
 * React hydrated and call `document.documentElement.classList.add('light')`.
 * That meant the page rendered with the default dark palette first, then
 * snapped to light ~50–300ms later when the effect fired — a very visible
 * flash since `html.light` rewrites every `--color-bg-*` and
 * `--color-text-*` variable (near-black background to white).
 *
 * The fix puts a synchronous initializer in <head>:
 *   1. Reads localStorage.potd:theme.
 *   2. If 'light', adds the `light` class to documentElement before paint.
 *   3. Wrapped in try/catch — Safari Private Mode throws on localStorage.
 *
 * Plus `suppressHydrationWarning` on <html> because the SSR-rendered
 * className doesn't include the `light` class that the script just added,
 * and React would warn about the mismatch on every hydration.
 *
 * This test pins the structural shape so the FOUC fix can't silently
 * regress — a future refactor that moves theme init back to a useEffect
 * (or drops the suppress prop) will trip these assertions.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('layout.tsx — synchronous theme init avoids FOUC', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'app', 'layout.tsx'),
      'utf8',
    );
  });

  it('embeds a <script> with the theme initializer body', () => {
    assert.match(
      src,
      /dangerouslySetInnerHTML/,
      'layout must inject an inline script via dangerouslySetInnerHTML — Next.js Script component is also OK but this assertion expects the dangerouslySetInnerHTML form',
    );
  });

  it('the script reads localStorage.potd:theme', () => {
    // The key must match the one StatusBar writes to (web/components/StatusBar.tsx
    // toggleTheme: localStorage.setItem('potd:theme', ...)). A mismatched
    // key reads null forever and the FOUC silently returns.
    assert.match(src, /localStorage\.getItem\(\s*['"]potd:theme['"]/);
  });

  it("the script adds the 'light' class to documentElement when saved theme is 'light'", () => {
    // Adding the class to <body> (or anything other than documentElement)
    // wouldn't trigger the html.light CSS variables in globals.css.
    assert.match(src, /documentElement\.classList\.add\(\s*['"]light['"]/);
    // And it must guard on === 'light' — adding the class unconditionally
    // would flip every dark-mode user into light on first load.
    assert.match(src, /===\s*['"]light['"]/);
  });

  it('the script is try/catch-wrapped to survive Safari Private Mode and locked-down browsers', () => {
    // Some browsers throw SecurityError when accessing localStorage in
    // private/restricted modes. Without the wrapper, the inline script
    // throws, the page still paints (dark), but every page load logs an
    // uncaught error. Worse, if a future refactor adds something
    // load-bearing after the localStorage line, that something stops
    // running.
    assert.match(src, /try\s*\{[^}]*localStorage/);
    assert.match(src, /catch\s*\(/);
  });

  it('the inline script lives in <head>, not <body>, so it runs before any visible content paints', () => {
    // If the script is appended at the end of <body>, the browser will
    // paint <body>'s children with the dark palette first, then the script
    // runs and re-paints in light — the exact FOUC we're trying to kill.
    // Placement matters more than the script's content here.
    const headStart = src.indexOf('<head>');
    const bodyStart = src.indexOf('<body');
    const scriptIdx = src.indexOf('dangerouslySetInnerHTML');
    assert.ok(headStart >= 0, 'layout must render a <head> element to host the initializer');
    assert.ok(scriptIdx > headStart && scriptIdx < bodyStart, 'script must appear inside <head>, before <body>');
  });

  it('<html> has suppressHydrationWarning so React does not warn about the class diff', () => {
    // The SSR-rendered <html> className doesn't include 'light'; the
    // client-side documentElement.classList does (after the script runs);
    // these are different and React would otherwise log a hydration
    // mismatch warning on every paint for light-theme users.
    // Require at least one attribute after `<html ` so the regex doesn't
    // accidentally pin to a bare `<html>` in a comment (e.g. "applies the
    // `light` class to <html>") and miss the actual JSX tag.
    const htmlTag = src.match(/<html\s+[^>]*>/);
    assert.ok(htmlTag, 'could not locate <html> tag with attributes');
    assert.match(htmlTag![0], /suppressHydrationWarning/);
  });
});
