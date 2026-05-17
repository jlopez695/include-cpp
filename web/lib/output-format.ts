import type { TestResult } from './types';

interface OutputLine {
  text: string;
  cls: string;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Strip an incoming stdout/stderr chunk into displayable lines.
 *
 * Two transforms:
 *
 *   1. ANSI color escapes are stripped. The OutputPanel renders plain
 *      text — leaving the CSI sequences in would surface as gibberish
 *      like `[31merror[0m` in the UI.
 *
 *   2. The trailing empty produced by `split('\n')` on a chunk that
 *      ends with `\n` is dropped. Pre-fix every chunk like `"hello\n"`
 *      mapped to `["hello", ""]`, and the `''` then became a literal
 *      space line in the panel — one extra blank row between every
 *      chunk vs. what a terminal would show. Interior blank lines
 *      (intentional `printf("\n")` etc.) are preserved.
 *
 * Exported so the trailing-newline invariant can be pinned without
 * mounting the editor; useProblemEditor's `appendOutput` calls this
 * helper to build the row list it pushes into state.
 */
export function splitOutputChunk(text: string): string[] {
  const lines = text.replace(ANSI_RE, '').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Format output lines and test results into plain text for clipboard.
 */
export function formatOutputText(
  lines: OutputLine[],
  testResults: TestResult[],
): string {
  const parts: string[] = [];

  if (lines.length > 0) {
    parts.push(lines.map(l => l.text).join('\n'));
  }

  if (testResults.length > 0) {
    if (parts.length > 0) parts.push('');
    for (const t of testResults) {
      const icon = t.status === 'pass' ? '\u2713' : '\u2717';
      parts.push(`${icon} ${t.name}`);
      if (t.message) {
        parts.push(`  ${t.message}`);
      }
    }
  }

  return parts.join('\n');
}
