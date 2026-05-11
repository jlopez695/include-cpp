import type { Diagnostic } from './types';

/**
 * Parse gcc/clang stderr output for error/warning/note locations.
 *
 * Matches patterns like:
 *   file.cpp:10:5: error: use of undeclared identifier 'x'
 *   /abs/path/file.cpp:10:5: warning: unused variable 'y'
 *   file.cpp:10: error: message (no column)
 */
const DIAG_RE = /^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|note):\s*(.+)$/;

export function parseDiagnostics(
  stderr: string,
  knownFiles: string[],
): Map<string, Diagnostic[]> {
  const result = new Map<string, Diagnostic[]>();

  for (const line of stderr.split('\n')) {
    const m = line.match(DIAG_RE);
    if (!m) continue;

    const [, filepath, lineStr, colStr, severity, message] = m;
    const basename = filepath.split('/').pop() ?? filepath;

    const matchedFile = knownFiles.find(
      f => f === basename || f === filepath || f.endsWith('/' + basename),
    );
    if (!matchedFile) continue;

    const diag: Diagnostic = {
      line: parseInt(lineStr, 10),
      col: colStr ? parseInt(colStr, 10) : 1,
      severity: severity === 'note' ? 'info' : (severity as 'error' | 'warning'),
      message,
    };

    if (!result.has(matchedFile)) result.set(matchedFile, []);
    result.get(matchedFile)!.push(diag);
  }

  return result;
}
