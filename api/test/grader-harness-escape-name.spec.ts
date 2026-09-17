/**
 * Regression test for "emit_test_event escapes the sentinel's `message`
 * attribute but not its `name`, so a test whose name contains a double
 * quote is rendered truncated in the UI".
 *
 * Pre-fix shape (problems/_shared/grader_harness.h): the escape pass —
 * `"` → `\"`, newline → space, `>>>` → `>> >` — was inlined in
 * emit_test_event and run over `message` only. `name` was interpolated
 * raw into the printf format:
 *
 *   std::printf("<<<POTD-TEST name=\"%s\" status=%s>>>\n", name, status);
 *
 * A grader written in the obvious style for an equality test —
 *
 *   POTD_TEST("FizzBuzz(3) == \"Fizz\"") { ... }
 *
 * therefore emitted
 *
 *   <<<POTD-TEST name="FizzBuzz(3) == "Fizz"" status=pass>>>
 *
 * and parseKv's quoted-string branch (/"((?:[^"\\]|\\.)*)"/ in
 * api/src/execution/sentinel.ts) ended the value at the SECOND quote.
 * The parsed name came back as `FizzBuzz(3) == ` with the rest dropped.
 *
 * What made this one nasty to diagnose: `status` still parsed correctly,
 * because the key-value scan resumes after the short match and finds
 * `status=pass` further along. So the test's pass/fail outcome was right
 * and only its label was mangled — the row looked like a rendering bug
 * in the frontend rather than anything to do with the name the author
 * had written. A name containing `>>>` was worse still: it terminated
 * the sentinel mid-body and leaked the tail into the user's output panel
 * as plain stdout.
 *
 * Both names and messages are author-controlled (they are string
 * literals in a grader.cpp that ships with the problem), so this is a
 * correctness and legibility fix, not a security boundary.
 *
 * The fix extracts the escape pass into `escape_sentinel_value` and
 * applies it to `name` as well as `message`. The `>>>` collapse that
 * escape pass performs is pinned separately in
 * grader-harness-escape-triplerangle.spec.ts.
 *
 * Two layers here:
 *
 *   (a) STRUCTURAL pin: emit_test_event must not interpolate a raw
 *       `name` into either printf branch. The no-message branch is easy
 *       to miss in a refactor precisely because it is the one that fires
 *       on every PASS.
 *
 *   (b) RUNTIME pin: compile a real grader against the real header, run
 *       it, and feed its actual stdout through the actual parser. This
 *       is the end-to-end claim that matters — the structural pin alone
 *       could pass while the escape produced something parseKv still
 *       misreads.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseSentinels } from '../src/execution/sentinel.js';

const SHARED_DIR = path.join(import.meta.dirname, '..', '..', 'problems', '_shared');

describe('grader_harness.h escapes the sentinel name attribute', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(path.join(SHARED_DIR, 'grader_harness.h'), 'utf8');
  });

  it('emit_test_event runs the name through escape_sentinel_value', () => {
    const emitFnSlice = extractEmitTestEventBody(source);
    assert.match(
      emitFnSlice,
      /escape_sentinel_value\(\s*name\s*\)/,
      'emit_test_event must escape `name` before interpolating it into the sentinel; a raw name containing `"` truncates the parsed value at parseKv',
    );
  });

  it('neither printf branch interpolates a raw name', () => {
    // The pre-fix bug lived in BOTH branches, and the no-message branch
    // is the one that fires on every passing test — i.e. the common
    // path. Pin that every printf argument list in emit_test_event
    // passes the escaped copy rather than the raw `const char* name`.
    const emitFnSlice = extractEmitTestEventBody(source);
    const printfCalls = emitFnSlice.match(/std::printf\([\s\S]*?\);/g) ?? [];
    assert.ok(printfCalls.length >= 2, 'emit_test_event should still have both a message and a no-message printf branch');
    for (const call of printfCalls) {
      assert.doesNotMatch(
        call,
        /,\s*name\s*[,)]/,
        `emit_test_event printf branch passes the raw \`name\` argument, which re-opens the truncation bug:\n${call}`,
      );
    }
  });
});

describe('a compiled grader with quote- and rangle-bearing test names round-trips through parseSentinels', () => {
  // Build a throwaway grader against the real header, run it, and parse
  // its real stdout. Names chosen to cover the three escape rules plus
  // the plain case:
  //
  //   - an embedded pair of double quotes (the reported bug)
  //   - a literal `>>>` run (terminates the sentinel pre-escape)
  //   - a name with no special characters (must survive untouched)
  //
  // Each test also FAILS with a message carrying the same hazards, so
  // the name and message escapes are exercised on the same row.
  let events: ReturnType<typeof parseSentinels>;
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'potd-escape-name-'));
    const graderSrc = `
#include "grader_harness.h"

POTD_TEST("FizzBuzz(3) == \\"Fizz\\"") {
    POTD_FAIL("got \\"Buzz\\" instead");
}

POTD_TEST("shift >>> is not a close marker") {
    POTD_FAIL("saw >>> in the middle");
}

POTD_TEST("plain name with no hazards") {
}

int main() { return potd::run_all(); }
`;
    const srcPath = path.join(tmpDir, 'grader.cpp');
    const binPath = path.join(tmpDir, 'grader_bin');
    fs.writeFileSync(srcPath, graderSrc);
    execFileSync('c++', ['-std=c++17', '-O0', '-I', SHARED_DIR, srcPath, '-o', binPath], {
      stdio: 'pipe',
    });
    // run_all returns non-zero when any test fails, which is the
    // expected outcome here — capture stdout rather than throwing.
    let stdout = '';
    try {
      stdout = execFileSync(binPath, { encoding: 'utf8' });
    } catch (err) {
      stdout = (err as { stdout?: string }).stdout ?? '';
    }
    events = parseSentinels(stdout);
  });

  it('every test emits exactly one TEST row plus the RESULT row', () => {
    const testEvents = events.filter(e => e.type === 'test');
    const resultEvents = events.filter(e => e.type === 'result');
    assert.equal(testEvents.length, 3, 'a hazardous name must not split or swallow a sentinel row');
    assert.equal(resultEvents.length, 1);
  });

  it('a name containing double quotes survives intact', () => {
    // Round trip is quote-for-quote: emit_test_event writes `\"` into the
    // sentinel and parseKv's `.replace(/\\"/g, '"')` restores the bare
    // quote, so the parsed name matches the C++ string literal exactly.
    const names = events.filter(e => e.type === 'test').map(e => (e as { name: string }).name);
    assert.ok(
      names.includes('FizzBuzz(3) == "Fizz"'),
      `the quoted name must round-trip with its quotes intact, not be truncated at the first one. Got: ${JSON.stringify(names)}`,
    );
    // The specific pre-fix corruption: truncation at the opening quote.
    assert.ok(
      !names.includes('FizzBuzz(3) == '),
      'name truncated at the embedded quote — this is the exact pre-fix bug',
    );
  });

  it('a name containing `>>>` does not terminate the sentinel early', () => {
    const names = events.filter(e => e.type === 'test').map(e => (e as { name: string }).name);
    assert.ok(
      names.includes('shift >> > is not a close marker'),
      `the \`>>>\` run must be broken to \`>> >\` and the rest of the name preserved. Got: ${JSON.stringify(names)}`,
    );
  });

  it('a name with no special characters is passed through unchanged', () => {
    const names = events.filter(e => e.type === 'test').map(e => (e as { name: string }).name);
    assert.ok(
      names.includes('plain name with no hazards'),
      `the escape pass must be a no-op for ordinary names. Got: ${JSON.stringify(names)}`,
    );
  });

  it('status still parses correctly on every row', () => {
    // Pre-fix, status parsed fine even on a corrupted name — that is
    // what disguised the bug. Pin it so the fix didn't trade a mangled
    // name for a mangled status.
    const testEvents = events.filter(e => e.type === 'test') as Array<{ name: string; status: string }>;
    const byName = new Map(testEvents.map(e => [e.name, e.status]));
    assert.equal(byName.get('plain name with no hazards'), 'pass');
    assert.equal(byName.get('FizzBuzz(3) == "Fizz"'), 'fail');
    assert.equal(byName.get('shift >> > is not a close marker'), 'fail');
  });
});

/**
 * Slice out just the body of `emit_test_event` so the structural pins
 * can't satisfy themselves against unrelated code elsewhere in the
 * header. Cheap brace-counting parser; the function's body has no
 * unbalanced brace literals.
 */
function extractEmitTestEventBody(source: string): string {
  const sig = source.indexOf('inline void emit_test_event(');
  assert.ok(sig >= 0, 'emit_test_event must be defined in grader_harness.h');
  const openBrace = source.indexOf('{', sig);
  assert.ok(openBrace > sig);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(openBrace, i + 1);
    }
  }
  throw new Error('emit_test_event closing brace not found');
}
