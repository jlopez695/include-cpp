import type { TestResult } from './types';

interface OutputLine {
  text: string;
  cls: string;
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
