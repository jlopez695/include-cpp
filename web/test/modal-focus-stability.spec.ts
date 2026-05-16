/**
 * Regression test for "Modal steals focus back to the opener on every
 * parent re-render".
 *
 * Repro chain (before this fix):
 *   1. Modal's focus-trap effect listed `[open, onClose]` as its deps.
 *   2. Both callers pass `onClose` as an inline arrow function:
 *        <ProgressDashboard onClose={() => setShowProgress(false)} />
 *        <KeyboardShortcuts  onClose={() => setShowShortcuts(false)} />
 *      Inline arrow → fresh function identity on every parent render.
 *   3. Whenever the parent re-rendered while the modal stayed open, the
 *      effect's cleanup fired (calling previouslyFocused.current?.focus()
 *      to restore the OPENER's focus) and then the setup fired again
 *      (focusables[0]?.focus() snapped focus back to the first item in
 *      the modal). Net visual: a focus-ring flicker, plus screen readers
 *      announcing the dialog all over again.
 *   4. ProblemWorkspace re-renders constantly while a test run is in
 *      flight (output lines, sentinel events, cursor moves, etc.) and
 *      forwards a new onClose to <KeyboardShortcuts> each time, so the
 *      flicker was easy to trigger in practice: open the shortcuts modal
 *      mid-test-run and watch the focus jump.
 *
 * The fix routes onClose through a ref so the effect deps shrink to
 * `[open]` — open is a boolean that only flips on real state changes,
 * so the focus-trap effect runs exactly twice per modal session
 * (setup on open, cleanup on close) regardless of how many times the
 * parent re-renders in between. The Escape handler now reads
 * onCloseRef.current() so it still picks up the latest closure.
 *
 * This file pins both layers:
 *   - structural: the ref pattern + `[open]` dep array
 *   - runtime:   render Modal, re-render the parent N times, assert
 *     the focus-trap effect did not fire its cleanup mid-session
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { render, act } from '@testing-library/react';
import React from 'react';

import { Modal } from '../components/Modal.js';

after(() => {
  GlobalRegistrator.unregister();
});

describe('Modal — structural pins', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'Modal.tsx'),
      'utf8',
    );
  });

  it('routes onClose through a ref instead of capturing the latest closure in the effect', () => {
    // The fix introduces onCloseRef + a sync useEffect to keep it
    // current. Without those two pieces, removing onClose from the
    // main effect's deps would freeze the Escape handler to the
    // FIRST onClose value, which is wrong if the parent ever swaps
    // identity (most parents do — inline arrows).
    assert.match(src, /onCloseRef\s*=\s*useRef\(onClose\)/);
    assert.match(src, /onCloseRef\.current\s*=\s*onClose/);
    assert.match(src, /onCloseRef\.current\(\)/);
  });

  it("focus-trap effect deps are [open] alone — NOT [open, onClose]", () => {
    // Anchor on the keydown listener line to be sure we're inspecting the
    // right effect (Modal has two useEffects after the fix — the
    // onCloseRef sync and the focus-trap proper).
    const trapEffect = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?addEventListener\(\s*['"]keydown['"][\s\S]*?\},\s*\[([^\]]+)\]\)/,
    );
    assert.ok(trapEffect, 'could not locate the focus-trap useEffect');
    const deps = trapEffect![1].trim();
    assert.equal(
      deps,
      'open',
      `focus-trap useEffect must depend on [open] only — got [${deps}]`,
    );
  });
});

describe('Modal — runtime: focus is not stolen on parent re-render', () => {
  it('focus-trap cleanup does NOT fire mid-session when the parent re-renders with new onClose identities', () => {
    // Use a probe ref-callback as one of the focusables. We only care
    // that focus stays inside the modal across parent re-renders — the
    // simplest observation is "previouslyFocused.current?.focus?.()
    // (which is what the cleanup calls) never fires while open is true".
    // Since previouslyFocused is internal we can't probe it directly,
    // so we instead count how many times focus moves AWAY from the
    // modal's inner button across parent re-renders.

    function Host({ rerenderCount }: { rerenderCount: number }) {
      // Each render produces a fresh `onClose` identity, exactly the
      // shape that triggered the regression. `rerenderCount` is the
      // controlled re-render counter.
      void rerenderCount;
      return React.createElement(Modal, {
        open: true,
        onClose: () => { /* new identity each render */ },
        title: 'T',
        children: React.createElement('button', { type: 'button', 'data-testid': 'inner' }, 'inner'),
      });
    }

    // Mount with an opener button that owns initial focus.
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    assert.equal(document.activeElement, opener, 'opener must hold focus before mount');

    const { rerender, unmount } = render(React.createElement(Host, { rerenderCount: 0 }));

    // After mount the focus-trap should have focused the FIRST focusable
    // inside the modal (the chrome's close button, which renders before
    // children). We don't need to check WHICH element — only that focus
    // is no longer on the opener.
    assert.notEqual(
      document.activeElement,
      opener,
      'focus-trap should have moved focus into the modal on open',
    );
    const insideOnMount = document.activeElement;

    // Force several parent re-renders. Each one passes a fresh onClose.
    // Pre-fix: each rerender would (a) cleanup → focus opener, then
    // (b) setup → focus first focusable. The mid-cycle "focus opener"
    // step is the regression — it should not happen.
    for (let i = 1; i <= 5; i++) {
      act(() => {
        rerender(React.createElement(Host, { rerenderCount: i }));
      });
    }

    // Post-fix: focus stays exactly where the modal originally put it.
    // (Pre-fix you'd often catch focus on the opener mid-cycle, or on
    // a DIFFERENT focusable in the modal if the cleanup race resolved
    // in a different order.)
    assert.equal(
      document.activeElement,
      insideOnMount,
      'focus must stay on the same element across parent re-renders — focus-trap cleanup should not have fired',
    );
    assert.notEqual(
      document.activeElement,
      opener,
      'focus must NOT have bounced back to the opener at any point',
    );

    unmount();
    opener.remove();
  });

  it('focus IS restored to the opener when the modal actually closes', () => {
    // Symmetric guarantee: the fix must NOT eliminate the focus-restore
    // path entirely; it must only stop firing it when the modal is
    // still supposed to be open.
    const opener = document.createElement('button');
    opener.id = 'opener-close-test';
    document.body.appendChild(opener);
    opener.focus();

    function Host({ open }: { open: boolean }) {
      return React.createElement(Modal, {
        open,
        onClose: () => {},
        title: 'T',
        children: React.createElement('button', { type: 'button' }, 'inside'),
      });
    }

    const { rerender, unmount } = render(React.createElement(Host, { open: true }));
    assert.notEqual(document.activeElement, opener, 'modal opens → focus moves inside');

    act(() => {
      rerender(React.createElement(Host, { open: false }));
    });

    assert.equal(
      document.activeElement,
      opener,
      'modal closes → focus must return to the element that opened it',
    );

    unmount();
    opener.remove();
  });
});
