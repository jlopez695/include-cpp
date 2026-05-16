/**
 * Regression test for the "OutputPanel yanks me back to the bottom while I'm
 * trying to read earlier output" bug.
 *
 * Before the fix, the scroll-to-bottom effect ran on every change to
 * `lines.length` / `testResults.length` unconditionally. While a run was
 * streaming new SSE events, scrolling up to inspect an earlier failure was
 * impossible — the next chunk of output would snap the viewport back down.
 *
 * The fix is stick-to-bottom: track whether the user is already near the
 * bottom and only auto-scroll when they are. We assert the source has both
 * (a) the gating ref + scroll listener that updates it, and (b) the effect
 * reading the ref before scrolling.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('OutputPanel stick-to-bottom autoscroll', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'components', 'OutputPanel.tsx'),
      'utf8',
    );
  });

  it('declares a stick-to-bottom ref (not state — scroll events must not re-render)', () => {
    assert.match(source, /stickToBottomRef\s*=\s*useRef\(true\)/);
    // Guards against accidentally regressing to useState, which would cause
    // a re-render on every scroll tick.
    assert.doesNotMatch(source, /stickToBottom\s*,\s*setStickToBottom\s*\]\s*=\s*useState/);
  });

  it('updates the stick flag from an onScroll handler', () => {
    assert.match(source, /onScroll=\{handleScroll\}/);
    assert.match(source, /const\s+handleScroll\s*=/);
    // The handler must compute distance from the bottom and write the ref.
    assert.match(source, /scrollHeight\s*-\s*[^;]*clientHeight\s*-\s*[^;]*scrollTop/);
    assert.match(source, /stickToBottomRef\.current\s*=/);
  });

  it('autoscroll effect early-returns when the user has scrolled up', () => {
    // The effect must check the ref BEFORE writing scrollTop, otherwise
    // it'll yank the viewport regardless of where the user is.
    const effectMatch = source.match(
      /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[lines\.length,\s*testResults\.length\]\s*\)/,
    );
    assert.ok(effectMatch, 'expected the lines/testResults autoscroll useEffect to still exist');
    const body = effectMatch![1];
    assert.match(body, /if\s*\(\s*!\s*stickToBottomRef\.current\s*\)\s*return/);
    // Sanity: the effect still ends with the scroll assignment.
    assert.match(body, /scrollTop\s*=\s*[^;]*scrollHeight/);
  });
});
