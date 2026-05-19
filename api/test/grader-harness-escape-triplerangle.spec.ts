/**
 * Regression test for "emit_test_event doesn't escape `>>>` in
 * assertion messages, so the sentinel parser truncates on a close-marker
 * collision".
 *
 * Background: the SENTINEL_RE regex in api/src/execution/sentinel.ts
 * matches `<<<POTD-(TEST|RESULT)\s+(.+?)>>>` with a NON-GREEDY body
 * because the previous fix needed the body to allow single-` >` chars
 * (`result.size() >= 11`). The non-greedy choice means the close marker
 * is whichever `>>>` appears FIRST after the open, so if the message
 * itself contains a literal `>>>` it terminates the sentinel mid-body.
 * Concrete sequence pre-fix:
 *
 *   emit_test_event("foo", "fail", "expected x >>> 3, got 5")
 *     → stdout:
 *       <<<POTD-TEST name="foo" status=fail message="expected x >>> 3, got 5">>>
 *
 * parseSentinels' non-greedy capture latched onto the first `>>>` in
 * the message body. parseKv read `message="expected x ` (stopping at
 * a space inside the open quote because the alt branch matches an
 * unquoted token), and the trailing ` 3, got 5">>>` leaked into the
 * user's output panel as plain stdout via the second inline-strip
 * pass of stripSentinels. User saw a corrupted TEST row and a
 * fragment of sentinel markup with no clue why.
 *
 * The sentinel.ts header comment already documents the constraint
 * ("Body can contain `>` ... but cannot contain the literal terminator
 * `>>>`."). The fix enforces that constraint from inside the grader by
 * inserting a space between the 2nd and 3rd `>` of any run-of-3:
 *
 *   >>>     →   >> >
 *   >>>>   →   >> >>     (after one pass; the loop continues so
 *                          longer runs collapse one at a time)
 *   >>     →   >>        (untouched — single/double > runs are
 *                          legal sentinel body content)
 *
 * Two checks here:
 *
 *   (a) STRUCTURAL pin against problems/_shared/grader_harness.h
 *       asserting the source contains the triple-> collapse logic, so
 *       a refactor that "simplifies" emit_test_event back to the
 *       pre-fix shape trips CI.
 *
 *   (b) RUNTIME pin against the JS-side parser: hand-construct the
 *       escaped sentinel the way emit_test_event would emit it, feed
 *       it through parseSentinels, and assert exactly one TEST event
 *       comes back with the expected (escaped) message string. This
 *       proves the escape doesn't accidentally produce something
 *       *else* the parser misreads (e.g., turning a sentinel into two
 *       sentinels, or breaking the quoted-string handling).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseSentinels } from '../src/execution/sentinel.js';

describe('grader_harness.h emit_test_event escapes any `>>>` run in the message body', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'problems', '_shared', 'grader_harness.h'),
      'utf8',
    );
  });

  it('emit_test_event collapses any `>>>` run in the escape pass', () => {
    // Pin the specific shape from the fix: find(">>>") inside the
    // function. The exact replacement string can drift in a future
    // refactor (e.g., a different separator), so anchor on the
    // distinguishing feature: a find of the literal three-`>` string
    // inside the function body.
    const emitFnSlice = extractEmitTestEventBody(source);
    assert.match(
      emitFnSlice,
      /find\("\>\>\>"/,
      'emit_test_event must search for the literal `>>>` close-marker substring inside the escaped message and break it before printing the sentinel. Without this guard a message like "expected x >>> 3" terminates the sentinel mid-body and corrupts the parsed TEST row.',
    );
  });

  it('emit_test_event still escapes embedded double-quotes (the pre-existing escape is preserved)', () => {
    // The fix layered on top of the existing escape pass; if a future
    // refactor swaps the loop body and accidentally drops the `"` →
    // `\\"` rule, parseKv's quoted-string branch breaks. Pin the
    // existing quote-escape so regressing to "I just rewrote the
    // escape loop" trips here.
    const emitFnSlice = extractEmitTestEventBody(source);
    assert.match(
      emitFnSlice,
      /c\s*==\s*'"'/,
      "emit_test_event must still escape embedded `\"` characters; parseKv's quoted-string branch depends on it",
    );
  });
});

describe('parseSentinels accepts the escaped triple-rangle shape that emit_test_event produces', () => {
  // Simulate exactly what the harness writes: the message string has
  // `>>>` collapsed to `>> >`. The visible result reads as three
  // consecutive `>` characters (with a single space splitting the
  // run), but no `>>>` substring exists in the body so the parser's
  // close-marker can't latch onto it.
  it('one TEST event with the escaped message survives intact', () => {
    const sentinel =
      '<<<POTD-TEST name="foo" status=fail message="expected x >> > 3, got 5">>>';
    const events = parseSentinels(sentinel);
    assert.equal(events.length, 1, 'must parse to exactly one TEST event, not two');
    const ev = events[0]!;
    assert.equal(ev.type, 'test');
    if (ev.type === 'test') {
      assert.equal(ev.name, 'foo');
      assert.equal(ev.status, 'fail');
      assert.equal(ev.message, 'expected x >> > 3, got 5');
    }
  });

  it('a sentinel followed by adjacent user stdout still parses as exactly one event (no second-sentinel ghost)', () => {
    // Defends against an escape that accidentally creates a fake second
    // open-marker. The harness emits the sentinel on its own line, but
    // a future refactor could end up inlining it next to user stdout.
    // Make sure the escaped form doesn't expose that as a parser hazard.
    const chunk =
      '<<<POTD-TEST name="bar" status=fail message="size >> > 11">>>\nuser printed: 5\n';
    const events = parseSentinels(chunk);
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.type, 'test');
    if (ev.type === 'test') {
      assert.equal(ev.message, 'size >> > 11');
    }
  });

  it('the unescaped (pre-fix) shape is still pathological — pins the failure mode the fix prevents', () => {
    // Pre-fix harness output. Asserting on the WRONG-parsing shape
    // here documents why the escape is necessary. If parseSentinels
    // ever changes to handle unescaped `>>>` directly (e.g., by
    // requiring the close-marker to be at end-of-line), this test
    // would update — but the harness-side escape stays a belt-and-
    // suspenders defense.
    const sentinel =
      '<<<POTD-TEST name="foo" status=fail message="expected x >>> 3, got 5">>>';
    const events = parseSentinels(sentinel);
    // The non-greedy regex truncates at the FIRST `>>>`. Exactly one
    // TEST event comes out but its message is corrupted (truncated at
    // the first space inside the open quote, per parseKv's alt branch).
    // We don't pin the exact corrupted shape — only that the message
    // is NOT the intended "expected x >>> 3, got 5" string.
    assert.equal(events.length, 1, 'pre-fix sentinel produces one event from the truncated capture');
    const ev = events[0]!;
    if (ev.type === 'test') {
      assert.notEqual(
        ev.message,
        'expected x >>> 3, got 5',
        'pre-fix unescaped `>>>` in the message truncates the parsed payload — this is the bug the harness fix prevents at the source',
      );
    }
  });
});

/**
 * Slice out just the body of `emit_test_event` from grader_harness.h
 * so the structural-pin assertions don't accidentally satisfy themselves
 * against unrelated code elsewhere in the header. Returns the substring
 * between the function signature and its closing brace.
 *
 * Cheap brace-counting parser — emit_test_event has no nested unbalanced
 * brace literals in its body (the `>>>` appears inside string literals,
 * but the outer braces match cleanly).
 */
function extractEmitTestEventBody(source: string): string {
  const sig = source.indexOf('inline void emit_test_event(');
  assert.ok(sig >= 0, 'emit_test_event must be defined in grader_harness.h');
  const openBrace = source.indexOf('{', sig);
  assert.ok(openBrace > sig);
  let depth = 0;
  let i = openBrace;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(openBrace, i + 1);
      }
    }
  }
  throw new Error('emit_test_event closing brace not found');
}
