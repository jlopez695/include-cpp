/**
 * Regression test for "result sentinel lost when stdout ends without a
 * trailing newline".
 *
 * pipeChild buffers stdout line-by-line: a chunk that has no `\n` stays
 * in `stdoutTail` until a later chunk completes it. When the child's
 * stdout `end` event fires, any remaining tail used to be dumped as
 * RAW stdout, bypassing the sentinel parser. The grader harness today
 * appends `\n` after every sentinel line via printf, so the tail is
 * normally empty — but any of these paths can leave a sentinel in the
 * tail at EOF:
 *
 *   - SIGKILL mid-print (wallTimer / abort): the child can be killed
 *     after `<<<GRADER-RESULT ...>>>` has flushed but before the trailing
 *     `\n` does.
 *   - A future harness author who forgets `\n` or fflush.
 *   - Custom buffering inside the test binary that defers the newline
 *     past EOF.
 *
 * Before this fix, the tail in those cases was emitted as a literal
 * `stdout` event. The UI doesn't strip sentinels from stdout (that
 * happens in the parser path), so users saw raw `<<<GRADER-RESULT ...>>>`
 * text in their output panel AND the result line ("N / total tests
 * passed") never appeared because no `result` sentinel event ever
 * reached the renderer. A real "5/5 pass" run could look like 0/0.
 *
 * The fix unifies the on-data and on-end paths through dispatchStdout,
 * which runs the parser over both. These tests verify the EOF flush
 * path specifically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchStdout } from '../src/execution/makefile-runner.js';
import type { StreamEvent } from '../src/execution/event-emitter.js';
import type { SentinelEvent } from '../src/execution/sentinel.js';

interface Collected {
  events: StreamEvent[];
  sentinels: SentinelEvent[];
}

function collect(text: string): Collected {
  const events: StreamEvent[] = [];
  const sentinels: SentinelEvent[] = [];
  dispatchStdout(
    text,
    (e) => events.push(e),
    (ev) => sentinels.push(ev),
  );
  return { events, sentinels };
}

test('dispatchStdout: sentinel WITH trailing newline parses and emits no raw stdout', () => {
  const { events, sentinels } = collect(
    '<<<GRADER-RESULT tests-passed=5 tests-total=5>>>\n',
  );
  assert.equal(sentinels.length, 1, 'should parse one sentinel');
  assert.deepEqual(sentinels[0], { type: 'result', passed: 5, total: 5 });
  const stdoutEvents = events.filter(e => e.kind === 'stdout');
  assert.equal(stdoutEvents.length, 0, 'no raw stdout when input is sentinel-only');
});

test('dispatchStdout: sentinel WITHOUT trailing newline still parses (the EOF flush case)', () => {
  // This is the bug. Pre-fix this called emit({kind:"stdout", data: "<<<GRADER-RESULT...>>>"})
  // and zero sentinel callbacks fired, so the renderer never saw the result event.
  const { events, sentinels } = collect(
    '<<<GRADER-RESULT tests-passed=3 tests-total=5>>>',
  );
  assert.equal(sentinels.length, 1, 'sentinel must still be parsed at EOF');
  assert.deepEqual(sentinels[0], { type: 'result', passed: 3, total: 5 });
  // And critically, the sentinel text must NOT have leaked into raw stdout.
  const stdoutEvents = events.filter(e => e.kind === 'stdout');
  assert.equal(
    stdoutEvents.length,
    0,
    'sentinel text must not appear as raw stdout (it would render as <<<GRADER-RESULT...>>> verbatim)',
  );
});

test('dispatchStdout: real user text WITHOUT trailing newline is still emitted as raw stdout', () => {
  // Symmetric guarantee: the fix must not eat legitimate trailing output.
  // A program that prints "Hello" with no endl and exits should still
  // surface that "Hello" to the user.
  const { events, sentinels } = collect('Hello, world');
  assert.equal(sentinels.length, 0);
  const stdoutEvents = events.filter(e => e.kind === 'stdout');
  assert.equal(stdoutEvents.length, 1);
  assert.equal((stdoutEvents[0] as Extract<StreamEvent, { kind: 'stdout' }>).data, 'Hello, world');
});

test('dispatchStdout: mixed user text + sentinel without trailing newline (the realistic SIGKILL shape)', () => {
  // The most likely real-world EOF shape: the harness has emitted several
  // test-pass sentinels (each newline-terminated) and is now writing the
  // result sentinel when SIGKILL lands after `>>>` but before `\n`. The
  // tail at on-end will look something like this:
  const tail =
    'Last user line\n' +
    '<<<GRADER-TEST name="t" status=pass>>>\n' +
    '<<<GRADER-RESULT tests-passed=1 tests-total=1>>>';
  const { events, sentinels } = collect(tail);

  // Both sentinels recovered.
  assert.equal(sentinels.length, 2);
  assert.equal(sentinels[0].type, 'test');
  assert.equal(sentinels[1].type, 'result');

  // The user line survives as raw stdout.
  const stdoutData = events
    .filter((e): e is Extract<StreamEvent, { kind: 'stdout' }> => e.kind === 'stdout')
    .map(e => e.data)
    .join('');
  assert.match(stdoutData, /Last user line/);
  // ...and the sentinel text does NOT show up in stdout (no leak).
  assert.doesNotMatch(stdoutData, /GRADER-TEST/);
  assert.doesNotMatch(stdoutData, /GRADER-RESULT/);
});
