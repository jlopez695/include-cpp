import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSentinels, stripSentinels } from '../src/execution/sentinel.js';

test('parses a single pass event', () => {
  const events = parseSentinels('<<<POTD-TEST name="foo" status=pass>>>');
  assert.deepEqual(events, [{ type: 'test', name: 'foo', status: 'pass' }]);
});

test('parses a fail event with message', () => {
  const events = parseSentinels(
    '<<<POTD-TEST name="bar" status=fail message="expected 1, got 0">>>',
  );
  assert.deepEqual(events, [
    { type: 'test', name: 'bar', status: 'fail', message: 'expected 1, got 0' },
  ]);
});

test('parses a result line', () => {
  const events = parseSentinels('<<<POTD-RESULT tests-passed=3 tests-total=5>>>');
  assert.deepEqual(events, [{ type: 'result', passed: 3, total: 5 }]);
});

test('parses multiple events from one chunk', () => {
  const events = parseSentinels(
    'noise\n<<<POTD-TEST name="a" status=pass>>>\nnoise\n<<<POTD-TEST name="b" status=fail message="x">>>\n<<<POTD-RESULT tests-passed=1 tests-total=2>>>',
  );
  assert.equal(events.length, 3);
  assert.equal(events[0]!.type, 'test');
  assert.equal(events[2]!.type, 'result');
});

test('ignores arbitrary user cout that mentions POTD', () => {
  const events = parseSentinels('I love POTD-RESULT and POTD-TEST stuff\n<<broken syntax');
  assert.deepEqual(events, []);
});

test('stripSentinels removes sentinel lines, keeps the rest', () => {
  const input =
    'real output\n<<<POTD-TEST name="x" status=pass>>>\nmore output\n<<<POTD-RESULT tests-passed=1 tests-total=1>>>\n';
  const stripped = stripSentinels(input);
  assert.match(stripped, /real output/);
  assert.match(stripped, /more output/);
  assert.doesNotMatch(stripped, /POTD-TEST/);
  assert.doesNotMatch(stripped, /POTD-RESULT/);
});

test('allows > characters inside message body', () => {
  const events = parseSentinels(
    '<<<POTD-TEST name="size check" status=fail message="assertion failed: result.size() >= 11">>>',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'test');
  if (events[0]!.type === 'test') {
    assert.equal(events[0]!.message, 'assertion failed: result.size() >= 11');
  }
});

test('handles escaped quotes inside message', () => {
  const events = parseSentinels(
    '<<<POTD-TEST name="quoted" status=fail message="he said \\"no\\"">>>',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'test');
  if (events[0]!.type === 'test') {
    assert.equal(events[0]!.message, 'he said "no"');
  }
});
