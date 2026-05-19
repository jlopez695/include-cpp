import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for #2.3: OutputPanel used `key={i}` for both `lines`
 * and `testResults`. The latter was the real bug — TestResultRow
 * holds local useState for `expanded`, so a re-run that returned
 * tests in a different order made React reuse the same component
 * instance against a DIFFERENT test, stranding the "expanded" flag
 * on the wrong row. The former was nominally fine because lines is
 * append-only today, but tightening to a stable-enough key is free.
 *
 * Pin the post-fix source: `key={t.name}` for the testResults map
 * and a composite key (index + short text prefix) for the lines map.
 * A source-level test (not a render test) because the live component
 * needs jsdom + Monaco shims to mount.
 */

const root = path.join(import.meta.dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'components/OutputPanel.tsx'),
  'utf8',
);

describe('OutputPanel stable keys', () => {
  it('testResults rows are keyed on the test name, not the array index', () => {
    // The post-fix shape: testResults.map(t => <TestResultRow key={t.name} ...
    // Any reappearance of `<TestResultRow key={i}` or
    // `<TestResultRow key={i + ...}` reintroduces the expanded-state-
    // on-wrong-row bug.
    assert.match(
      source,
      /<TestResultRow\s+key=\{t\.name\}/,
      'TestResultRow must be keyed by t.name for identity stability across re-runs',
    );
    assert.ok(
      !/<TestResultRow\s+key=\{i\}/.test(source),
      'index-keyed TestResultRow strands expanded state on the wrong row',
    );
  });

  it('line rows use a composite key that incorporates the line text', () => {
    // The post-fix shape: key={`${i}-${line.text.slice(0, 16)}`}.
    // A bare `key={i}` would reintroduce the prepend/replace bug
    // even though the current callers append-only.
    assert.match(source, /key=\{`\$\{i\}-\$\{line\.text\.slice/);
  });
});
