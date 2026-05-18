import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJUnit } from '../src/execution/junit.js';

const ALL_PASS = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="MyTests" tests="3" failures="0" errors="0" time="0.123">
  <testcase name="hours_3600" time="0.001" />
  <testcase name="days_86400" time="0.002" />
  <testcase name="years_31536000" time="0.003" />
</testsuite>`;

const ONE_FAIL = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="MyTests" tests="3" failures="1" errors="0" time="0.123">
  <testcase name="hours_3600" time="0.001" />
  <testcase name="days_86400" time="0.002">
    <failure message="expected 1, got 0" />
  </testcase>
  <testcase name="years_31536000" time="0.003" />
</testsuite>`;

const WRAPPED_TESTSUITES = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Outer" tests="2" failures="1">
    <testcase name="a" />
    <testcase name="b"><failure>boom</failure></testcase>
  </testsuite>
</testsuites>`;

// Real-world shape that the pre-fix parser dropped on the floor:
// <testsuites> wrapping MULTIPLE <testsuite> siblings. fast-xml-parser
// surfaces those as `doc.testsuites.testsuite` = Array, and the old
// `Array.isArray(root.testcase)` branch sees `undefined` on an array,
// so `cases` became `[]` and the whole run reported 0/0. ctest emits
// this shape whenever a build registers more than one test binary —
// for instance, two add_test() invocations, or catch_discover_tests
// run for two separate Catch2 executables.
const MULTI_SUITE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="A" tests="2" failures="0">
    <testcase name="a1" time="0.001" />
    <testcase name="a2" time="0.002" />
  </testsuite>
  <testsuite name="B" tests="2" failures="1">
    <testcase name="b1" time="0.003" />
    <testcase name="b2" time="0.004">
      <failure message="b2 boom" />
    </testcase>
  </testsuite>
</testsuites>`;

// Mixed-shape multi-suite: one suite has a single <testcase> (object),
// the other has an array. The flattener has to normalize both.
const MULTI_SUITE_MIXED = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Solo">
    <testcase name="only_one" />
  </testsuite>
  <testsuite name="Pair">
    <testcase name="p1" />
    <testcase name="p2"><failure>nope</failure></testcase>
  </testsuite>
</testsuites>`;

const SINGLE_CASE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Solo" tests="1">
  <testcase name="alone" />
</testsuite>`;

const EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Empty" tests="0"></testsuite>`;

// ctest emits <skipped> for tests with the DISABLED property or a
// SKIP_REGULAR_EXPRESSION hit. Sometimes with a message attribute, sometimes
// just a self-closing tag with no body.
const ONE_SKIPPED = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="MyTests" tests="3" failures="0" errors="0" skipped="1">
  <testcase name="hours_3600" time="0.001" />
  <testcase name="disabled_case" time="0.000">
    <skipped message="Disabled by problem author" />
  </testcase>
  <testcase name="years_31536000" time="0.003" />
</testsuite>`;

// ctest emits <error> when the test binary couldn't run — fixture failure,
// missing binary, segfault before the harness reported, etc.
const ONE_ERRORED = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="MyTests" tests="2" failures="0" errors="1">
  <testcase name="ok_case" time="0.001" />
  <testcase name="crashy" time="0.000">
    <error message="child process exited with signal 11"></error>
  </testcase>
</testsuite>`;

// Defensive: mixed bag with skip, fail, error, and pass in one suite. None of
// the non-pass cases should count toward `passed`.
const MIXED = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="MyTests" tests="4" failures="1" errors="1" skipped="1">
  <testcase name="a" />
  <testcase name="b"><failure message="bad" /></testcase>
  <testcase name="c"><error message="boom" /></testcase>
  <testcase name="d"><skipped /></testcase>
</testsuite>`;

test('all-pass fixture: 3/3', () => {
  const r = parseJUnit(ALL_PASS);
  assert.equal(r.passed, 3);
  assert.equal(r.total, 3);
  assert.equal(r.tests.length, 3);
  assert.ok(r.tests.every(t => t.status === 'pass'));
});

test('one-fail fixture: 2/3 with message captured', () => {
  const r = parseJUnit(ONE_FAIL);
  assert.equal(r.passed, 2);
  assert.equal(r.total, 3);
  const failed = r.tests.find(t => t.name === 'days_86400');
  assert.ok(failed);
  assert.equal(failed?.status, 'fail');
  assert.equal(failed?.message, 'expected 1, got 0');
});

test('handles <testsuites> wrapper', () => {
  const r = parseJUnit(WRAPPED_TESTSUITES);
  assert.equal(r.total, 2);
  assert.equal(r.passed, 1);
  assert.equal(r.tests.find(t => t.name === 'b')?.status, 'fail');
});

test('flattens multiple <testsuite> siblings inside <testsuites>', () => {
  // Pre-fix regression: this exact shape made parseJUnit return 0/0
  // and an empty tests array, because `root` became an Array and
  // `root.testcase` is undefined. The fix walks the suites and
  // concatenates their testcases.
  const r = parseJUnit(MULTI_SUITE);
  assert.equal(r.total, 4, 'all 4 testcases across both suites must be counted');
  assert.equal(r.passed, 3, 'only b2 failed');
  assert.equal(r.tests.find(t => t.name === 'a1')?.status, 'pass');
  assert.equal(r.tests.find(t => t.name === 'a2')?.status, 'pass');
  assert.equal(r.tests.find(t => t.name === 'b1')?.status, 'pass');
  const b2 = r.tests.find(t => t.name === 'b2');
  assert.equal(b2?.status, 'fail');
  assert.equal(b2?.message, 'b2 boom');
});

test('multi-suite: handles a suite with a single testcase (object, not array) alongside a suite with multiple', () => {
  // fast-xml-parser delivers a single child as an object and multiple
  // as an array. The flattener must normalize both per-suite shapes.
  const r = parseJUnit(MULTI_SUITE_MIXED);
  assert.equal(r.total, 3);
  assert.equal(r.passed, 2);
  assert.equal(r.tests.find(t => t.name === 'only_one')?.status, 'pass');
  assert.equal(r.tests.find(t => t.name === 'p1')?.status, 'pass');
  assert.equal(r.tests.find(t => t.name === 'p2')?.status, 'fail');
});

test('single-testcase document is not flattened', () => {
  const r = parseJUnit(SINGLE_CASE);
  assert.equal(r.total, 1);
  assert.equal(r.tests[0]?.name, 'alone');
  assert.equal(r.tests[0]?.status, 'pass');
});

test('empty testsuite returns zeros', () => {
  const r = parseJUnit(EMPTY);
  assert.equal(r.passed, 0);
  assert.equal(r.total, 0);
});

test('malformed XML returns empty result', () => {
  const r = parseJUnit('<not><valid<<');
  assert.equal(r.total, 0);
});

test('<skipped> testcase is not counted as passed', () => {
  const r = parseJUnit(ONE_SKIPPED);
  // The skipped case must NOT count toward `passed`, otherwise a problem with
  // any DISABLED testcase would always look "solved enough" by mistake.
  assert.equal(r.passed, 2);
  assert.equal(r.total, 3);
  const skipped = r.tests.find(t => t.name === 'disabled_case');
  assert.equal(skipped?.status, 'skip');
  assert.equal(skipped?.message, 'Disabled by problem author');
});

test('<error> testcase is not counted as passed', () => {
  const r = parseJUnit(ONE_ERRORED);
  assert.equal(r.passed, 1);
  assert.equal(r.total, 2);
  const errored = r.tests.find(t => t.name === 'crashy');
  assert.equal(errored?.status, 'error');
  assert.equal(errored?.message, 'child process exited with signal 11');
});

test('mixed pass/fail/error/skip in one suite: only pass counts', () => {
  const r = parseJUnit(MIXED);
  assert.equal(r.total, 4);
  assert.equal(r.passed, 1);
  assert.equal(r.tests.find(t => t.name === 'a')?.status, 'pass');
  assert.equal(r.tests.find(t => t.name === 'b')?.status, 'fail');
  assert.equal(r.tests.find(t => t.name === 'c')?.status, 'error');
  assert.equal(r.tests.find(t => t.name === 'd')?.status, 'skip');
});

test('<skipped/> with no body or attributes parses with null message', () => {
  const r = parseJUnit(MIXED);
  const skipped = r.tests.find(t => t.name === 'd');
  assert.equal(skipped?.status, 'skip');
  assert.equal(skipped?.message, null);
});

test('failure precedence: <failure> wins over <skipped> if both appear', () => {
  // Shouldn't happen in well-formed ctest output, but be defensive — a
  // failure is the more actionable signal.
  const xml = `<?xml version="1.0"?>
    <testsuite name="t" tests="1">
      <testcase name="weird">
        <failure message="real failure" />
        <skipped message="ignored" />
      </testcase>
    </testsuite>`;
  const r = parseJUnit(xml);
  assert.equal(r.tests[0]?.status, 'fail');
  assert.equal(r.tests[0]?.message, 'real failure');
});

test('non-numeric @_time attribute resolves to durationMs=null, not NaN', () => {
  // Pre-fix path:
  //   parseFloat("not-a-number") → NaN
  //   Math.round(NaN * 1000)     → NaN
  //   durationMs                 → NaN  (NOT null, despite the type)
  // The downstream consumer in cmake-runner does
  //   t.durationMs != null ? { ...withMessage, durationMs: t.durationMs } : withMessage
  // and NaN passes `!= null`, so the SSE event carried `durationMs: NaN`.
  // JSON.stringify(NaN) === 'null', so the wire payload looked sane —
  // but the in-process value was NaN, the type was a lie, and a server-side
  // render of the duration pill would have shown "NaNms".
  // Post-fix: a non-finite parseFloat result resolves to durationMs=null.
  const xml = `<?xml version="1.0"?>
    <testsuite name="t" tests="2">
      <testcase name="bad_time" time="not-a-number" />
      <testcase name="empty_time" time="" />
    </testsuite>`;
  const r = parseJUnit(xml);
  const bad = r.tests.find(t => t.name === 'bad_time');
  const empty = r.tests.find(t => t.name === 'empty_time');
  // The pre-fix value was NaN. `NaN === null` is false and `NaN === NaN` is
  // false, so a naive `assert.equal(..., null)` would also have failed on
  // a NaN. The explicit Number.isNaN check below pins the distinction.
  assert.equal(bad?.durationMs, null, 'unparseable time must produce null, not NaN');
  assert.ok(!Number.isNaN(bad?.durationMs as number | null), 'durationMs must not be NaN');
  assert.equal(empty?.durationMs, null, 'empty time string must produce null, not NaN');
  assert.ok(!Number.isNaN(empty?.durationMs as number | null), 'durationMs must not be NaN');
});

test('valid float time still parses correctly (smoke check the parser fix did not regress the happy path)', () => {
  const xml = `<?xml version="1.0"?>
    <testsuite name="t" tests="1">
      <testcase name="ok" time="0.250" />
    </testsuite>`;
  const r = parseJUnit(xml);
  assert.equal(r.tests[0]?.durationMs, 250);
});

test('failure body text (no attribute) is captured', () => {
  const xml = `<?xml version="1.0"?>
    <testsuite name="t" tests="1">
      <testcase name="x"><failure>raw body text</failure></testcase>
    </testsuite>`;
  const r = parseJUnit(xml);
  assert.equal(r.tests[0]?.message, 'raw body text');
});
