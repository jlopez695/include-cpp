import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSentinels, stripSentinels } from '../src/execution/sentinel.js';

test('parses a single pass event', () => {
  const events = parseSentinels('<<<GRADER-TEST name="foo" status=pass>>>');
  assert.deepEqual(events, [{ type: 'test', name: 'foo', status: 'pass' }]);
});

test('parses a fail event with message', () => {
  const events = parseSentinels(
    '<<<GRADER-TEST name="bar" status=fail message="expected 1, got 0">>>',
  );
  assert.deepEqual(events, [
    { type: 'test', name: 'bar', status: 'fail', message: 'expected 1, got 0' },
  ]);
});

test('parses a result line', () => {
  const events = parseSentinels('<<<GRADER-RESULT tests-passed=3 tests-total=5>>>');
  assert.deepEqual(events, [{ type: 'result', passed: 3, total: 5 }]);
});

test('result line with non-numeric counts coerces to 0 (no NaN leak)', () => {
  // Pre-fix, `Number("abc")` → NaN flowed straight into the ResultEvent.
  // Downstream the controller's `done` event carried NaN, JSON.stringify
  // coerced NaN to null on the wire, and the frontend's inferStatus
  // (`event.total > 0`) returned false on NaN-or-null — so a grader bug
  // that emitted a malformed result line LOOKED like a grader that
  // emitted no result line at all. A green-test run could come back
  // marked unsolved with no summary, with no obvious failure path to
  // debug. Coercing NaN to 0 keeps the wire payload type-stable and
  // collapses the malformed-result case onto the same downstream path
  // as the no-result case (which is the existing failure mode the rest
  // of the pipeline already handles).
  const events = parseSentinels('<<<GRADER-RESULT tests-passed=abc tests-total=xyz>>>');
  assert.equal(events.length, 1);
  const ev = events[0]!;
  assert.equal(ev.type, 'result');
  if (ev.type === 'result') {
    assert.equal(ev.passed, 0, 'unparseable passed must be 0, not NaN');
    assert.equal(ev.total, 0, 'unparseable total must be 0, not NaN');
    assert.ok(!Number.isNaN(ev.passed), 'passed must not be NaN');
    assert.ok(!Number.isNaN(ev.total), 'total must not be NaN');
  }
});

test('parses multiple events from one chunk', () => {
  const events = parseSentinels(
    'noise\n<<<GRADER-TEST name="a" status=pass>>>\nnoise\n<<<GRADER-TEST name="b" status=fail message="x">>>\n<<<GRADER-RESULT tests-passed=1 tests-total=2>>>',
  );
  assert.equal(events.length, 3);
  assert.equal(events[0]!.type, 'test');
  assert.equal(events[2]!.type, 'result');
});

test('ignores arbitrary user cout that mentions POTD', () => {
  const events = parseSentinels('I love GRADER-RESULT and GRADER-TEST stuff\n<<broken syntax');
  assert.deepEqual(events, []);
});

test('stripSentinels removes sentinel lines, keeps the rest', () => {
  const input =
    'real output\n<<<GRADER-TEST name="x" status=pass>>>\nmore output\n<<<GRADER-RESULT tests-passed=1 tests-total=1>>>\n';
  const stripped = stripSentinels(input);
  assert.match(stripped, /real output/);
  assert.match(stripped, /more output/);
  assert.doesNotMatch(stripped, /GRADER-TEST/);
  assert.doesNotMatch(stripped, /GRADER-RESULT/);
});

test('allows > characters inside message body', () => {
  const events = parseSentinels(
    '<<<GRADER-TEST name="size check" status=fail message="assertion failed: result.size() >= 11">>>',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'test');
  if (events[0]!.type === 'test') {
    assert.equal(events[0]!.message, 'assertion failed: result.size() >= 11');
  }
});

test('handles escaped quotes inside message', () => {
  const events = parseSentinels(
    '<<<GRADER-TEST name="quoted" status=fail message="he said \\"no\\"">>>',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'test');
  if (events[0]!.type === 'test') {
    assert.equal(events[0]!.message, 'he said "no"');
  }
});

// Regression: the old single-pass strip used a blanket `^[ \t]*\n` cleanup
// to collapse the blank line each stripped sentinel left behind, which also
// collapsed blank lines the user printed deliberately. Stripping must
// preserve intentional whitespace in user output — the only blank lines
// that should disappear are the ones a sentinel created.
test('stripSentinels preserves an intentional blank line in user output', () => {
  const input = 'a\n\nb\n<<<GRADER-TEST name="x" status=pass>>>\nc\n';
  assert.equal(stripSentinels(input), 'a\n\nb\nc\n');
});

test('stripSentinels preserves consecutive intentional blank lines', () => {
  const input = 'header\n\n\nfooter\n<<<GRADER-RESULT tests-passed=0 tests-total=0>>>\n';
  assert.equal(stripSentinels(input), 'header\n\n\nfooter\n');
});

test('stripSentinels handles sentinels on \\r\\n-terminated lines (Windows newlines)', () => {
  const input = 'a\r\n<<<GRADER-TEST name="x" status=pass>>>\r\nb\r\n';
  // Both the sentinel's preceding CR/LF and its own CR/LF terminator should
  // be consumed; the user's CR/LF line endings stay intact.
  assert.equal(stripSentinels(input), 'a\r\nb\r\n');
});

test('stripSentinels still removes a sentinel embedded inline with user output', () => {
  // Grader emitting a sentinel without a trailing newline next to user
  // output on the same line — strip just the sentinel markup, keep the
  // surrounding text.
  const input = 'before<<<GRADER-TEST name="inline" status=pass>>>after\n';
  assert.equal(stripSentinels(input), 'beforeafter\n');
});

test('stripSentinels still removes an end-of-stream tail sentinel with no newline', () => {
  // The on-end flush in pipeChild can hand stripSentinels a complete
  // sentinel that has no trailing newline (case (b) in the makefile-runner
  // comment). The fallback (inline) strip still has to remove it.
  const input = '<<<GRADER-RESULT tests-passed=1 tests-total=1>>>';
  assert.equal(stripSentinels(input), '');
});
