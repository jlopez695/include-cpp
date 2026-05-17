import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatOutputText, splitOutputChunk } from '../lib/output-format.js';

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

describe('splitOutputChunk', () => {
  /**
   * Pre-fix, `appendOutput` did `stripAnsi(text).split('\n').map(...)`
   * with no special-case for the trailing empty that `split` produces
   * on a string ending in `\n`. Every chunk like `"hello\n"` became two
   * lines in the panel \u2014 `"hello"` plus a single space \u2014 yielding a
   * visible extra blank row between every chunk a terminal would not
   * have shown.
   *
   * These tests pin the contract: trailing `\n` does NOT add a phantom
   * blank line, but interior blank lines (intentional `printf("\n")`
   * or a deliberate `puts("")`) are preserved.
   */

  it('"hello\\n" \u2192 ["hello"] (the trailing newline does not add a blank line)', () => {
    assert.deepEqual(splitOutputChunk('hello\n'), ['hello']);
  });

  it('"a\\nb\\n" \u2192 ["a", "b"] (two-line chunk does not gain a trailing blank)', () => {
    assert.deepEqual(splitOutputChunk('a\nb\n'), ['a', 'b']);
  });

  it('"a\\n\\nb\\n" \u2192 ["a", "", "b"] (interior blank line is preserved)', () => {
    assert.deepEqual(splitOutputChunk('a\n\nb\n'), ['a', '', 'b']);
  });

  it('"hello" without trailing newline \u2192 ["hello"]', () => {
    // A chunk that lacks a trailing \n (the common case for a printf
    // missing the newline, or any mid-line streamed chunk) does not
    // gain or lose a row.
    assert.deepEqual(splitOutputChunk('hello'), ['hello']);
  });

  it('empty string \u2192 [] (no rows for an empty chunk)', () => {
    // The trailing-empty drop converges to an empty array here, which
    // is the right thing: a no-content chunk should not push a phantom
    // blank line into the output panel.
    assert.deepEqual(splitOutputChunk(''), []);
  });

  it('lone "\\n" \u2192 [""] (a single blank line is a real intentional blank)', () => {
    // After the trailing-empty drop this yields a single empty row \u2014
    // the user wrote one newline, they get one blank line. (The
    // appendOutput wrapper then renders that as a single-space row so
    // the CSS doesn't collapse to zero height.)
    assert.deepEqual(splitOutputChunk('\n'), ['']);
  });

  it('strips ANSI color escapes alongside the trailing-newline drop', () => {
    // The previous appendOutput pipeline did stripAnsi BEFORE the
    // split. The helper preserves that ordering \u2014 the ANSI sequence
    // must vanish, not show up as `[31mhi[0m` in the panel.
    assert.deepEqual(splitOutputChunk('\x1b[31mhi\x1b[0m\n'), ['hi']);
  });

  // Pre-fix the helper split on `\n` alone, so any CRLF-terminated
  // chunk left a stray `\r` glued to the end of each line. The control
  // char then rode along through `whitespace-pre-wrap` rendering AND
  // through formatOutputText's Copy button, producing literal CRs in
  // clipboard output that didn't match what a terminal would show.
  // Bare `\r` (without a following `\n`) must NOT be touched \u2014 that's
  // the carriage-return-only escape used for in-place progress bars,
  // and conflating it with a line terminator would split one logical
  // line into two.
  it('"a\\r\\nb\\r\\n" \u2192 ["a", "b"] (CRLF line endings, no stray \\r)', () => {
    assert.deepEqual(splitOutputChunk('a\r\nb\r\n'), ['a', 'b']);
  });

  it('"a\\r\\n\\r\\nb\\r\\n" \u2192 ["a", "", "b"] (CRLF preserves intentional blank lines)', () => {
    assert.deepEqual(splitOutputChunk('a\r\n\r\nb\r\n'), ['a', '', 'b']);
  });

  it('mixed `\\n` and `\\r\\n` line terminators in one chunk', () => {
    // A producer might mix endings (some libc impls do this when
    // mixing puts/printf with custom buffered writers). Each terminator
    // must collapse to its line, leaving no trailing `\r` on the
    // CRLF-ended line.
    assert.deepEqual(splitOutputChunk('a\nb\r\nc\n'), ['a', 'b', 'c']);
  });

  it('bare "\\r" without a following "\\n" is preserved (progress-bar use)', () => {
    // `printf("progress: 50%%\rdone\n")` overwrites "progress: 50%"
    // with "done" in-place; the bare `\r` is meaningful and must NOT
    // be treated as a line terminator. Splitting it would surface as
    // two separate rows in the output panel instead of one updating
    // line.
    assert.deepEqual(splitOutputChunk('progress\rdone\n'), ['progress\rdone']);
  });

  it('lone "\\r\\n" \u2192 [""] (Windows-flavored single blank line)', () => {
    // Parity with the `\n` case: a single CRLF chunk yields exactly
    // one empty row, matching one terminal blank line.
    assert.deepEqual(splitOutputChunk('\r\n'), ['']);
  });
});
