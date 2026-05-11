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

test('all-pass fixture: 3/3', () => {
  const r = parseJUnit(ALL_PASS);
  assert.equal(r.passed, 3);
  assert.equal(r.total, 3);
  assert.equal(r.tests.length, 3);
  assert.ok(r.tests.every(t => t.failure === null));
});

test('one-fail fixture: 2/3 with message captured', () => {
  const r = parseJUnit(ONE_FAIL);
  assert.equal(r.passed, 2);
  assert.equal(r.total, 3);
  const failed = r.tests.find(t => t.name === 'days_86400');
  assert.ok(failed);
  assert.equal(failed?.failure, 'expected 1, got 0');
});

test('handles <testsuites> wrapper', () => {
  const r = parseJUnit(WRAPPED_TESTSUITES);
  assert.equal(r.total, 2);
  assert.equal(r.passed, 1);
});

test('single-testcase document is not flattened', () => {
  const r = parseJUnit(SINGLE_CASE);
  assert.equal(r.total, 1);
  assert.equal(r.tests[0]?.name, 'alone');
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
