/**
 * Regression test for "splitFile and diffMode survive a problem switch
 * and point at files that no longer exist."
 *
 * EditorPanel holds two pieces of per-problem UI state inside its own
 * useState calls:
 *
 *   const [splitFile, setSplitFile] = useState<string | null>(null);
 *   const [diffMode, setDiffMode] = useState(false);
 *
 * Neither resets when the user navigates to a different problem. The
 * component does not remount on navigation (its parent ProblemWorkspace
 * stays mounted; only the inner `editor: ProblemEditorState` swaps
 * shape via useProblemEditor's problem.id effect). So state from the
 * previous problem leaks across:
 *
 *   - splitFile pointing at, say, "hello.cpp" persists onto a problem
 *     whose editableFiles are ["epoch.cpp"]. The split pane renders,
 *     calls editor.models.getContent("hello.cpp") which returns "" (no
 *     such Monaco model), and shows a blank editor next to the real one.
 *
 *   - The split chrome's <select value={splitFile}> has no matching
 *     <option>. Browsers handle the value-without-option case by
 *     defaulting the visible selection to the first <option>, while the
 *     underlying `value` attribute still reports the stale filename —
 *     a silent desync between what the user sees and what state they
 *     have.
 *
 *   - The split toggle button reads `splitFile` truthy, so it renders
 *     in its "active" state. Clicking it sets splitFile to null
 *     (closing the invisible pane) instead of opening a real split, so
 *     the user has to click TWICE to actually open one.
 *
 *   - diffMode similarly compares against editor.starterFiles[
 *     editor.activeFile], which is the new problem's starter — not the
 *     starter the user is mentally diffing against.
 *
 * The fix derives a stable "did the set of files change" key by
 * joining the filename list and resets both state slots in an effect
 * gated on that key. Same-problem renders are no-ops; problem
 * navigation flushes the stale state on the first render after the
 * switch.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('EditorPanel resets splitFile and diffMode on problem switch', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'EditorPanel.tsx'),
      'utf8',
    );
  });

  it('derives a stable filesKey from editor.allFiles for change detection', () => {
    // The derivation MUST come from editor.allFiles' filename list — not
    // from editor.activeFile (changes when the user switches tabs inside
    // the SAME problem; resetting splitFile on a tab switch would be
    // hostile) and not from a fresh array reference (editor.allFiles is
    // rebuilt on every render of useProblemEditor, so a raw `[editor.allFiles]`
    // dep would reset splitFile on every parent re-render — not just on
    // navigation).
    assert.match(
      src,
      /const\s+filesKey\s*=\s*editor\.allFiles\.map\(\s*f\s*=>\s*f\.name\s*\)\.join\(/,
      'filesKey must be derived from editor.allFiles.map(f => f.name).join(...) so it changes only when the set of filenames changes',
    );
  });

  it('the reset useEffect depends on filesKey and clears BOTH per-problem UI states', () => {
    // The effect must clear splitFile AND diffMode. Clearing only one
    // leaves the other half of the bug in place — diffMode persisting
    // onto a new problem produces a confusing "Original: <filename>"
    // header pane comparing against the wrong starter.
    const effect = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?setSplitFile\(\s*null\s*\)[\s\S]*?setDiffMode\(\s*false\s*\)[\s\S]*?\},\s*\[\s*filesKey\s*\]\s*\)/,
    );
    assert.ok(
      effect,
      'must call setSplitFile(null) AND setDiffMode(false) inside a useEffect whose deps are exactly [filesKey]',
    );
  });

  it("the reset effect's dep array is [filesKey] alone, not [editor.allFiles]", () => {
    // Defensive pin: a refactor that swaps `filesKey` for `editor.allFiles`
    // re-introduces the per-render reset bug — editor.allFiles is a fresh
    // array on every render of useProblemEditor, so the effect would fire
    // every render and reset splitFile each time the user clicked Run
    // (any state update in useProblemEditor causes a re-render with a
    // fresh allFiles).
    const allEffects = [...src.matchAll(
      /useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setSplitFile\(\s*null\s*\)[\s\S]*?\},\s*\[([^\]]+)\]\s*\)/g,
    )];
    assert.ok(allEffects.length >= 1, 'must have a reset effect that calls setSplitFile(null)');
    const deps = allEffects[0]![1].trim();
    assert.equal(
      deps,
      'filesKey',
      `reset effect deps must be exactly [filesKey] — got [${deps}]`,
    );
  });
});
