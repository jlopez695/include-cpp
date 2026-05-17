import type { TestResult } from './types';

interface OutputLine {
  text: string;
  cls: string;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

// Split on either `\n` (Unix) or `\r\n` (CRLF). Bare `\r` (without a
// following `\n`) is *not* a line terminator — it's a carriage return,
// used by progress-bar–style output to overwrite the current line in
// place — so we deliberately preserve it. This regex only collapses
// the CR that immediately precedes a newline, which is the only `\r`
// the splitter has any business eating.
const LINE_TERMINATOR_RE = /\r?\n/;

/**
 * Strip an incoming stdout/stderr chunk into displayable lines.
 *
 * Three transforms:
 *
 *   1. ANSI color escapes are stripped. The OutputPanel renders plain
 *      text — leaving the CSI sequences in would surface as gibberish
 *      like `[31merror[0m` in the UI.
 *
 *   2. Lines are split on `\r?\n`, so CRLF-terminated chunks don't
 *      leave a trailing `\r` glued to the last character of each line.
 *      Pre-fix a chunk like `"hello\r\n"` mapped to `["hello\r"]`,
 *      and the lone `\r` (a control character) rode along into the
 *      `whitespace-pre-wrap` div in the output panel. CS 225 problems
 *      on macOS/Linux mostly emit `\n`, but any toolchain that flows
 *      through MSYS / Cygwin / MinGW (and some C++ runtime libraries
 *      mid-line on Windows) emits CRLF, and the `\r` survived end-to-
 *      end into both the panel render and the explicit Copy button's
 *      output. The regex form deliberately keeps bare `\r` intact —
 *      that's the carriage-return-only escape used for in-place
 *      progress bars; eating it would conflate two unrelated cases.
 *
 *   3. The trailing empty produced by splitting a chunk that ends
 *      with `\n` (or `\r\n`) is dropped. Pre-fix every chunk like
 *      `"hello\n"` mapped to `["hello", ""]`, and the `''` then
 *      became a literal space line in the panel — one extra blank
 *      row between every chunk vs. what a terminal would show.
 *      Interior blank lines (intentional `printf("\n")` etc.) are
 *      preserved.
 *
 * Exported so the trailing-newline invariant can be pinned without
 * mounting the editor; useProblemEditor's `appendOutput` calls this
 * helper to build the row list it pushes into state.
 */
export function splitOutputChunk(text: string): string[] {
  const lines = text.replace(ANSI_RE, '').split(LINE_TERMINATOR_RE);
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
