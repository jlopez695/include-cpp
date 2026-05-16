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

test('failure body text (no attribute) is captured', () => {
  const xml = `<?xml version="1.0"?>
    <testsuite name="t" tests="1">
      <testcase name="x"><failure>raw body text</failure></testcase>
    </testsuite>`;
  const r = parseJUnit(xml);
  assert.equal(r.tests[0]?.message, 'raw body text');
});
