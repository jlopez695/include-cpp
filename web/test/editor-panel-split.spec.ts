import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression test for "split-pane editor ignores font/tab/wrap preferences".
 *
 * EditorPanel renders three Monaco <Editor> panes: the main editor, the
 * diff pane (read-only original), and the split pane (read-only sibling
 * file). The fontSize / tabSize / wordWrap settings are held in component
 * state and persisted to localStorage. The main and diff panes correctly
 * thread those values into the Monaco `options` prop. The split pane
 * historically hard-coded `fontSize: 13`, `tabSize: 2`, `wordWrap: 'off'`,
 * so changing the font size with split view open would silently leave the
 * split pane at the wrong size while the other two panes resized.
 *
 * This test is source-level (not a renderHook test) because the bug is
 * structural: three JSX literals in a specific JSX block. Asserting their
 * absence catches the regression directly without the cost of mocking
 * @monaco-editor/react's dynamic import.
 */
describe('EditorPanel split pane', () => {
  let source: string;

  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'EditorPanel.tsx'),
      'utf8',
    );
  });

  // Isolate the JSX block that renders the split pane. The block starts at
  // the conditional `{splitFile && !diffMode &&` and ends at the matching
  // closing `)}` after `</div>`. We use the inner <Editor ... /> options
  // object literal as the assertion surface.
  function splitPaneOptions(): string {
    const start = source.indexOf('{splitFile && !diffMode &&');
    assert.ok(start >= 0, 'split-pane JSX block not found in EditorPanel.tsx');

    const optionsStart = source.indexOf('options={{', start);
    assert.ok(optionsStart >= 0, 'split-pane <Editor> options prop not found');

    // The options literal ends at the matching `}}` for the prop. Find the
    // earliest `}}` after optionsStart that isn't preceded by another `{`.
    const optionsEnd = source.indexOf('}}', optionsStart);
    assert.ok(optionsEnd >= 0, 'split-pane options literal close not found');

    return source.slice(optionsStart, optionsEnd + 2);
  }

  it('threads fontSize state into the split pane (no literal fontSize: <number>)', () => {
    const opts = splitPaneOptions();
    assert.ok(
      /fontSize,/.test(opts) || /fontSize:\s*fontSize\b/.test(opts),
      `split-pane Editor must use the fontSize state variable — got: ${opts}`,
    );
    assert.ok(
      !/fontSize:\s*\d+/.test(opts),
      `split-pane Editor must not hard-code fontSize to a number literal — got: ${opts}`,
    );
  });

  it('threads tabSize state into the split pane (no literal tabSize: <number>)', () => {
    const opts = splitPaneOptions();
    assert.ok(
      /tabSize,/.test(opts) || /tabSize:\s*tabSize\b/.test(opts),
      `split-pane Editor must use the tabSize state variable — got: ${opts}`,
    );
    assert.ok(
      !/tabSize:\s*\d+/.test(opts),
      `split-pane Editor must not hard-code tabSize to a number literal — got: ${opts}`,
    );
  });

  it('threads wordWrap state into the split pane (no literal wordWrap: "off")', () => {
    const opts = splitPaneOptions();
    // Accept either the state-derived expression `wordWrap ? 'on' : 'off'`
    // (preferred, matches the diff pane) or a direct `wordWrap` shorthand
    // if the prop is changed to take a boolean later.
    assert.ok(
      /wordWrap:\s*wordWrap\s*\?/.test(opts) || /wordWrap,/.test(opts),
      `split-pane Editor must derive wordWrap from state — got: ${opts}`,
    );
    assert.ok(
      !/wordWrap:\s*'off'/.test(opts) && !/wordWrap:\s*"off"/.test(opts),
      `split-pane Editor must not hard-code wordWrap to 'off' — got: ${opts}`,
    );
    assert.ok(
      !/wordWrap:\s*'on'/.test(opts) && !/wordWrap:\s*"on"/.test(opts),
      `split-pane Editor must not hard-code wordWrap to 'on' either — got: ${opts}`,
    );
  });
});
