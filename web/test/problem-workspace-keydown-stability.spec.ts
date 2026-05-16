/**
 * Regression test for "Cmd+? keyboard listener gets rebound on every
 * ProblemWorkspace render".
 *
 * ProblemWorkspace had a useEffect for the global Cmd+? shortcut whose
 * dep array was `[toggleShortcuts]`, and `toggleShortcuts` was declared
 * inline:
 *
 *   const toggleShortcuts = () => setShowShortcuts(v => !v);  // new ref / render
 *   useEffect(() => {
 *     const handler = (e) => { ... toggleShortcuts(); ... };
 *     window.addEventListener('keydown', handler);
 *     return () => window.removeEventListener('keydown', handler);
 *   }, [toggleShortcuts]);
 *
 * Two problems:
 *
 *   1. New function identity every render → effect cleanup + setup
 *      fired on every parent re-render. The parent (useProblemEditor's
 *      host) re-renders constantly while a test run is in flight —
 *      output lines arriving, sentinel events, cursor moves, the
 *      `running` flag flipping. Each tick removed and re-added the
 *      `keydown` listener on `window`. Not a leak (cleanup runs first),
 *      just churn.
 *
 *   2. More importantly, between the cleanup and the setup there is
 *      one microtask where NO listener is attached. A Cmd+? pressed in
 *      that window does nothing. Hard to provoke deliberately, but
 *      shows up as occasional "shortcut just didn't fire that one
 *      time" reports.
 *
 * The fix calls the setter (setShowShortcuts) directly inside the
 * handler using its reducer form, which is stable across renders, and
 * empties the dep array. The effect now fires exactly once on mount.
 *
 * Same anti-pattern was avoided in EditorPanel's Cmd+Shift+D and
 * SidebarWrapper's Cmd+B handlers — both already use the setter form
 * with `[]` deps. The pin here keeps ProblemWorkspace consistent.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('ProblemWorkspace keyboard shortcut listener is bound once', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'app', 'problems', '[id]', 'ProblemWorkspace.tsx'),
      'utf8',
    );
  });

  it("the Cmd+? useEffect has an empty dep array", () => {
    // Anchor on the keydown handler that watches for `e.key === '?'`
    // (the Cmd+? shortcut). The dep array on that specific useEffect
    // must be `[]` — not `[toggleShortcuts]` or anything else that
    // re-creates per render.
    // Source-order matters: the inline arrow `handler` is DECLARED first
    // and contains the `e.key === '?'` check, then `window.addEventListener`
    // is called below. The regex has to mirror that order — anchor on
    // `'?'` first, then on `addEventListener('keydown'`. [\s\S]*? lets the
    // pattern span the inner `}` characters of the handler's if-block.
    const effect = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?['"]\?['"][\s\S]*?addEventListener\(\s*['"]keydown['"][\s\S]*?\},\s*\[([^\]]*)\]\s*\)/,
    );
    assert.ok(effect, 'could not locate the Cmd+? keyboard effect');
    const deps = effect![1].trim();
    assert.equal(
      deps,
      '',
      `Cmd+? effect must depend on [] — found [${deps}]`,
    );
  });

  it('the handler uses the setShowShortcuts reducer form directly', () => {
    // The fix path: call setShowShortcuts(v => !v) inside the handler,
    // NOT toggleShortcuts() (which captured the latest closure and was
    // the reason the dep array originally needed to include it).
    const effect = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?['"]\?['"][\s\S]*?addEventListener\(\s*['"]keydown['"][\s\S]*?\},\s*\[\s*\]\s*\)/,
    );
    assert.ok(effect, 'could not locate the empty-dep Cmd+? effect');
    assert.match(
      effect![0],
      /setShowShortcuts\(\s*\w+\s*=>\s*!\w+\s*\)/,
      'handler must call setShowShortcuts(v => !v) — using the reducer form keeps the effect dep-free',
    );
    // And specifically NOT routing through the inline `toggleShortcuts`
    // wrapper, which re-introduces the per-render identity problem.
    assert.doesNotMatch(
      effect![0],
      /toggleShortcuts\(\s*\)/,
      'handler must not call toggleShortcuts() — that was the original bug',
    );
  });
});
