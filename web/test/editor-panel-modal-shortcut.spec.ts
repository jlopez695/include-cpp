/**
 * Regression test for "Cmd+Shift+D toggles diff mode behind any open modal".
 *
 * EditorPanel binds a global `window` keydown listener for Cmd+Shift+D
 * that flips its `diffMode` state. The listener fires regardless of
 * where focus lives, including inside an open Modal (KeyboardShortcuts,
 * ProgressDashboard, or any future modal). Pre-fix:
 *
 *   1. User opens the KeyboardShortcuts modal.
 *   2. User reads the listed shortcuts, types Cmd+Shift+D (e.g. to test
 *      a shortcut, or because the modal lists it as the "diff toggle").
 *   3. The keydown reaches the window-level listener, which has no idea
 *      a modal is mounted; it flips diffMode on the editor underneath.
 *   4. User closes the modal and discovers the editor unexpectedly
 *      split into the side-by-side starter-code diff view, with no
 *      visible cause (the toggle happened behind the modal backdrop).
 *
 * The fix bails the handler at the top if any element matching
 * `[role="dialog"][aria-modal="true"]` is in the DOM. Modal.tsx already
 * renders its panel with exactly those attributes (see Modal.tsx:84-90),
 * so this requires no new contract and stays correct for any future
 * modal that uses the shared Modal chrome. The selector check has to
 * happen BEFORE the metaKey/shiftKey/key check so the short-circuit
 * fires regardless of which key combo was pressed — a future shortcut
 * added to the same listener should also be modal-aware by default.
 *
 * Coverage:
 *   - Structural pin on EditorPanel.tsx that the modal check is in the
 *     handler and that it's positioned to short-circuit *before* the
 *     keystroke is examined.
 *   - Runtime check that a rendered Modal actually matches the
 *     selector the handler queries for, so future Modal.tsx refactors
 *     that drop `role="dialog"` or `aria-modal="true"` fail this
 *     test (and break the modal contract for screen readers in the
 *     same change — both regressions caught for the price of one).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import React from 'react';

import { Modal } from '../components/Modal.js';

after(() => {
  GlobalRegistrator.unregister();
});

describe('EditorPanel: Cmd+Shift+D handler bails when a modal is open', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'EditorPanel.tsx'),
      'utf8',
    );
  });

  // Isolate the Cmd+Shift+D handler block so the structural pins below
  // can't be satisfied by a stray match elsewhere in the file (e.g. an
  // unrelated comment that mentions "role=dialog").
  function diffShortcutHandlerBlock(): string {
    // Anchor on the comment that documents the shortcut (stable across
    // refactors — explanatory comments rarely move) and capture through
    // the matching close brace + dep array of the useEffect.
    const m = src.match(
      /\/\/ Cmd\+Shift\+D to toggle diff view[\s\S]*?useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\s*\]\s*\)/,
    );
    assert.ok(m, 'could not locate the Cmd+Shift+D useEffect — has the comment or shape changed?');
    return m![0];
  }

  it("queries for an open dialog via [role=\"dialog\"][aria-modal=\"true\"]", () => {
    const block = diffShortcutHandlerBlock();
    // Exact selector — must match the Modal.tsx contract (role="dialog"
    // PLUS aria-modal="true"). A selector that omits aria-modal would
    // match every popover/menu that uses role="dialog" without being
    // truly modal — wrong scope.
    assert.match(
      block,
      /document\.querySelector\(\s*['"`]\[role="dialog"\]\[aria-modal="true"\]['"`]\s*\)/,
      'handler must guard with document.querySelector(\'[role="dialog"][aria-modal="true"]\')',
    );
  });

  it("the modal check short-circuits BEFORE the metaKey/shiftKey/key test", () => {
    const block = diffShortcutHandlerBlock();
    // Position-sensitive: querySelector must appear before the keystroke
    // check. If a future refactor inverts the order, the handler still
    // 'works' for the diff toggle case but leaks the same bug shape to
    // any sibling shortcut added under the same listener.
    const queryIdx = block.indexOf('querySelector');
    const metaIdx = block.indexOf('metaKey');
    assert.ok(queryIdx >= 0, 'expected querySelector in handler block');
    assert.ok(metaIdx >= 0, 'expected metaKey check in handler block');
    assert.ok(
      queryIdx < metaIdx,
      `modal check (offset ${queryIdx}) must appear BEFORE the metaKey check (offset ${metaIdx}) so it short-circuits regardless of which combo was pressed`,
    );
  });

  it("Modal.tsx still renders [role=\"dialog\"][aria-modal=\"true\"] — the selector the handler depends on", () => {
    // Runtime contract check: render a real Modal and confirm the
    // selector resolves to it. A Modal.tsx refactor that drops either
    // attribute would silently re-enable the bug; this test fails fast
    // in that case (and would also flag the same change as a screen-
    // reader regression — the two go hand in hand).
    const { unmount } = render(
      React.createElement(Modal, {
        open: true,
        onClose: () => {},
        title: 'test',
        children: React.createElement('div', null, 'body'),
      }),
    );
    const found = document.querySelector('[role="dialog"][aria-modal="true"]');
    assert.ok(
      found,
      'a mounted Modal must match [role="dialog"][aria-modal="true"] — the EditorPanel Cmd+Shift+D handler relies on this exact selector',
    );
    unmount();
  });
});
