import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatOutputText } from '../lib/output-format.js';

describe('formatOutputText', () => {
  it('returns empty string for no content', () => {
    assert.equal(formatOutputText([], []), '');
  });

  it('formats raw output lines only', () => {
    const lines = [
      { text: 'hello world', cls: '' },
      { text: 'line 2', cls: '' },
    ];
    assert.equal(formatOutputText(lines, []), 'hello world\nline 2');
  });

  it('formats test results only', () => {
    const tests = [
      { name: 'test_add', status: 'pass' as const },
      { name: 'test_sub', status: 'fail' as const, message: 'expected 3 but got 4' },
    ];
    const result = formatOutputText([], tests);
    assert.ok(result.includes('\u2713 test_add'));
    assert.ok(result.includes('\u2717 test_sub'));
    assert.ok(result.includes('  expected 3 but got 4'));
  });

  it('formats mixed lines and test results with separator', () => {
    const lines = [{ text: 'compiling...', cls: '' }];
    const tests = [{ name: 'test1', status: 'pass' as const }];
    const result = formatOutputText(lines, tests);
    const parts = result.split('\n');
    assert.equal(parts[0], 'compiling...');
    assert.equal(parts[1], ''); // blank separator
    assert.ok(parts[2].includes('test1'));
  });

  it('handles tests without messages', () => {
    const tests = [
      { name: 'passing_test', status: 'pass' as const },
    ];
    const result = formatOutputText([], tests);
    assert.equal(result, '\u2713 passing_test');
  });
});
