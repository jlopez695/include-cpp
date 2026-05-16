import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression test for "Reset leaves stale modified-dots and red squiggles
 * on inactive tabs."
 *
 * Monaco's `onDidChangeModelContent` listener is attached to the editor in
 * EditorPanel, not to each model — so when useProblemEditor.reset() calls
 * models.updateContent (which delegates to model.setValue) on every file,
 * the listener only fires for the file currently bound to the editor. For
 * every other file, the onContentChange path that would prune modifiedFiles
 * never runs, and the tab keeps its "modified" dot even though the buffer
 * is now byte-identical to the starter. Compiler diagnostics from the
 * previous run have the same problem: their line numbers refer to code
 * the user just discarded.
 *
 * The fix is for reset() itself to (a) clear modifiedFiles and (b) clear
 * all diagnostic markers, since it knows exactly what state the editor is
 * about to be in. This test pins those two calls in place so a future
 * refactor of reset() can't silently re-introduce the stale-UI bug.
 *
 * Static-source check (rather than a runtime renderHook test) because
 * useProblemEditor's surface — useSSE, localStorage, the Monaco mock — is
 * large enough that a runtime fixture would be brittle in different ways
 * than the bug it's trying to catch. The pattern matches
 * monaco-models-lifecycle.spec.ts.
 */
describe('useProblemEditor.reset()', () => {
  let source: string;
  let resetBody: string;

  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'hooks', 'useProblemEditor.ts'),
      'utf8',
    );
    // Pull out the reset function body. The function is declared as
    //   const reset = () => { ... };
    // Find the opening, then walk braces to find the matching close so the
    // test still works if reset() grows additional statements.
    const startMatch = source.match(/const reset\s*=\s*\(\)\s*=>\s*\{/);
    assert.ok(startMatch, 'expected `const reset = () => { ... }` in useProblemEditor');
    const startIdx = startMatch.index! + startMatch[0].length;
    let depth = 1;
    let i = startIdx;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    assert.equal(depth, 0, 'unbalanced braces while extracting reset() body');
    resetBody = source.slice(startIdx, i - 1);
  });

  it('clears modifiedFiles so non-active tabs lose their stale modified-dot', () => {
    assert.match(
      resetBody,
      /setModifiedFiles\(\s*new Set\(\s*\)\s*\)/,
      'reset() must call setModifiedFiles(new Set()) — otherwise tabs other ' +
        'than the active one keep their "modified" indicator after reset, ' +
        'because Monaco\'s editor-level onDidChangeModelContent listener ' +
        'only fires for the currently-attached model.',
    );
  });

  it('clears compiler diagnostics so stale red squiggles do not linger', () => {
    assert.match(
      resetBody,
      /models\.clearAllDiagnostics\(\)/,
      'reset() must call models.clearAllDiagnostics() — markers from the ' +
        'previous run point at code that no longer exists after reset.',
    );
  });

  it('clears the editable-files localStorage entries (no behavior change — guard)', () => {
    // Guard against an accidental removal of clearCode, since without it
    // the next page load would resurrect the pre-reset code on inactive
    // tabs from localStorage even though the editor models hold starter.
    assert.match(
      resetBody,
      /clearCode\(\s*problem\.id\s*,\s*editableNames\s*\)/,
      'reset() must call clearCode(problem.id, editableNames) so localStorage ' +
        'does not resurrect the pre-reset code on next load.',
    );
  });
});
