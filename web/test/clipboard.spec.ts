import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractTextFromTree } from '../lib/clipboard.js';

describe('extractTextFromTree', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(extractTextFromTree(null), '');
    assert.equal(extractTextFromTree(undefined), '');
  });

  it('returns string leaves directly', () => {
    assert.equal(extractTextFromTree('hello world'), 'hello world');
  });

  it('concatenates array of strings', () => {
    assert.equal(extractTextFromTree(['hello', ' ', 'world']), 'hello world');
  });

  it('extracts text from nested {children} tree', () => {
    const tree = {
      children: [
        { children: 'int main()' },
        { children: ' {\n' },
        { children: [{ children: '  return 0;' }] },
        { children: '\n}' },
      ],
    };
    assert.equal(extractTextFromTree(tree), 'int main() {\n  return 0;\n}');
  });

  it('handles deeply nested structures', () => {
    const tree = {
      children: {
        children: {
          children: 'deeply nested',
        },
      },
    };
    assert.equal(extractTextFromTree(tree), 'deeply nested');
  });

  it('handles mixed arrays and objects', () => {
    const tree = [
      { children: 'line1\n' },
      'line2\n',
      { children: ['line3', ' continued'] },
    ];
    assert.equal(extractTextFromTree(tree), 'line1\nline2\nline3 continued');
  });

  it('handles empty code block', () => {
    const tree = { children: '' };
    assert.equal(extractTextFromTree(tree), '');
  });
});
