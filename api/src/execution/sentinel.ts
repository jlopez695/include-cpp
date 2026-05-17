/**
 * Sentinel-wrapped grader output.
 *
 * Graders emit lines that survive collision with arbitrary user `cout`.
 * The parser extracts these without false positives from regular output.
 *
 * Format:
 *   <<<POTD-TEST name="hours(3600)" status=pass>>>
 *   <<<POTD-TEST name="days(86400)" status=fail message="expected 1, got 0">>>
 *   <<<POTD-RESULT tests-passed=3 tests-total=5>>>
 */

export type TestStatus = 'pass' | 'fail' | 'skip' | 'crash';

export interface TestEvent {
  type: 'test';
  name: string;
  status: TestStatus;
  message?: string;
  durationMs?: number;
}

export interface ResultEvent {
  type: 'result';
  passed: number;
  total: number;
}

export type SentinelEvent = TestEvent | ResultEvent;

// Body can contain `>` (e.g. `result.size() >= 11`) but cannot contain the
// literal terminator `>>>`. Non-greedy match to the closing `>>>`.
const SENTINEL_RE = /<<<POTD-(TEST|RESULT)\s+(.+?)>>>/g;

function parseKv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Matches key=value or key="quoted value"
  const re = /(\w[\w-]*)=(?:"((?:[^"\\]|\\.)*)"|([^\s"]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1]!;
    const value = m[2] !== undefined ? m[2].replace(/\\"/g, '"') : m[3]!;
    out[key] = value;
  }
  return out;
}

export function parseSentinels(chunk: string): SentinelEvent[] {
  const events: SentinelEvent[] = [];
  let m: RegExpExecArray | null;
  SENTINEL_RE.lastIndex = 0;
  while ((m = SENTINEL_RE.exec(chunk)) !== null) {
    const kind = m[1]!;
    const kv = parseKv(m[2]!);
    if (kind === 'TEST') {
      const name = kv.name ?? '(unnamed)';
      const status = (kv.status ?? 'fail') as TestStatus;
      const message = kv.message;
      events.push(message ? { type: 'test', name, status, message } : { type: 'test', name, status });
    } else {
      const passed = Number(kv['tests-passed'] ?? 0);
      const total = Number(kv['tests-total'] ?? 0);
      events.push({ type: 'result', passed, total });
    }
  }
  return events;
}

/**
 * Strip sentinel markup from a chunk so it doesn't render in the user-visible
 * output panel.
 *
 * Two passes:
 *
 *   1. Sentinel-only lines (modulo leading/trailing horizontal whitespace) —
 *      consume the entire line *including its trailing newline*, so the
 *      sentinel doesn't leave behind a phantom blank line. This is the common
 *      case: graders emit sentinels on their own line.
 *
 *   2. Anything else that still looks like a sentinel — an inline sentinel
 *      ("Hello<<<POTD-TEST...>>> world"), or an end-of-stream tail where the
 *      final sentinel arrived without a trailing newline. Strip just the
 *      sentinel markup; leave the surrounding text alone.
 *
 * The old single-pass implementation was `replace(SENTINEL_RE, '')` followed
 * by a blanket `replace(/^[ \t]*\n/gm, '')` to collapse the blank line each
 * stripped sentinel left behind. That second pass also collapsed blank lines
 * the user printed deliberately — `cout << "a\n\nb\n"` would render as
 * `a\nb\n` in the output panel, because the cleanup couldn't tell a
 * sentinel-induced blank line apart from an intentional one. Consuming the
 * trailing newline as part of the sentinel match removes the need for the
 * blanket cleanup, so intentional blank lines survive.
 */
export function stripSentinels(chunk: string): string {
  let cleaned = chunk.replace(SENTINEL_LINE_RE, '');
  cleaned = cleaned.replace(SENTINEL_RE, '');
  return cleaned;
}

// Whole-line sentinel: optional leading/trailing horizontal whitespace,
// followed by the line's terminating newline. Multiline (`m`) so `^`/`$`
// anchor to line boundaries within the chunk, not just the chunk boundary.
const SENTINEL_LINE_RE = /^[ \t]*<<<POTD-(?:TEST|RESULT)\s+.+?>>>[ \t]*\r?\n/gm;
