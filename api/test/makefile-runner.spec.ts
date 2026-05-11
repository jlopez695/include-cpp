import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMakefile } from '../src/execution/makefile-runner.js';
import type { StreamEvent } from '../src/execution/event-emitter.js';

const VALID_SOLUTION = `#include "hello.h"
#include <string>
std::string hello() {
  return std::string("Hello world! My name is Jacob and I am 21 years old.");
}
`;

const BROKEN_SOLUTION = `#include "hello.h"
#include <string>
std::string hello() {
  this is not valid c++;
}
`;

const SEMANTIC_FAIL = `#include "hello.h"
#include <string>
std::string hello() { return std::string("nope"); }
`;

async function run(files: Record<string, string>, mode: 'run' | 'test') {
  const events: StreamEvent[] = [];
  const ctrl = new AbortController();
  const result = await runMakefile('POTD0', files, mode, 'main', e => events.push(e), ctrl.signal);
  return { result, events };
}

test('makefile-runner: valid solution → all 5 tests pass via sentinels', async () => {
  const { result, events } = await run({ 'hello.cpp': VALID_SOLUTION }, 'test');
  assert.equal(result.passed, 5);
  assert.equal(result.total, 5);
  assert.equal(result.exitCode, 0);

  const tests = events.flatMap(e =>
    e.kind === 'sentinel' && e.event.type === 'test' ? [e.event] : [],
  );
  assert.equal(tests.length, 5);
  assert.ok(tests.every(t => t.status === 'pass'));
});

test('makefile-runner: compile error → no sentinels, non-zero exit', async () => {
  const { result, events } = await run({ 'hello.cpp': BROKEN_SOLUTION }, 'test');
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.passed, 0);

  const tests = events.filter(e => e.kind === 'sentinel');
  assert.equal(tests.length, 0, 'no test events should fire when compile fails');

  const stderr = events.flatMap(e => (e.kind === 'stderr' ? [e.data] : [])).join('');
  assert.match(stderr, /error|Error/, 'compiler should have printed something to stderr');
});

test('makefile-runner: semantically wrong code → fork-per-test reports per-test failures', async () => {
  const { result, events } = await run({ 'hello.cpp': SEMANTIC_FAIL }, 'test');
  assert.equal(result.total, 5);
  assert.equal(result.passed, 0);

  const tests = events.flatMap(e =>
    e.kind === 'sentinel' && e.event.type === 'test' ? [e.event] : [],
  );
  assert.equal(tests.length, 5, 'all 5 tests should report even though all fail');
  assert.ok(tests.every(t => t.status === 'fail'));
  assert.ok(
    tests.every(t => typeof t.message === 'string' && t.message.length > 0),
    'every failure should carry an assertion message',
  );
});

test('SSE event ordering: compile-start strictly precedes any sentinel result event', async () => {
  const { events } = await run({ 'hello.cpp': VALID_SOLUTION }, 'test');
  const compileStartIdx = events.findIndex(e => e.kind === 'compile-start');
  const firstResultIdx = events.findIndex(
    e => e.kind === 'sentinel' && e.event.type === 'result',
  );
  assert.ok(compileStartIdx >= 0, 'compile-start must be emitted');
  assert.ok(firstResultIdx >= 0, 'result must be emitted');
  assert.ok(
    compileStartIdx < firstResultIdx,
    `compile-start (idx ${compileStartIdx}) must precede result (idx ${firstResultIdx})`,
  );
});

test('SSE event ordering: compile-end is the last protocol event of the run', async () => {
  const { events } = await run({ 'hello.cpp': VALID_SOLUTION }, 'test');
  const last = events[events.length - 1];
  assert.ok(last, 'must have events');
  assert.equal(last!.kind, 'compile-end');
});

test('SSE event ordering: tests appear before the result line', async () => {
  const { events } = await run({ 'hello.cpp': VALID_SOLUTION }, 'test');
  const firstResultIdx = events.findIndex(
    e => e.kind === 'sentinel' && e.event.type === 'result',
  );
  const testIndices = events
    .map((e, i) => (e.kind === 'sentinel' && e.event.type === 'test' ? i : -1))
    .filter(i => i >= 0);
  assert.ok(testIndices.length > 0);
  for (const idx of testIndices) {
    assert.ok(idx < firstResultIdx, `test event at ${idx} should come before result at ${firstResultIdx}`);
  }
});
