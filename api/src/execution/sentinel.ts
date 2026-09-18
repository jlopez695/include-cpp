/**
 * Sentinel-wrapped grader output.
 *
 * Graders emit lines that survive collision with arbitrary user `cout`.
 * The parser extracts these without false positives from regular output.
 *
 * Format:
 *   <<<GRADER-TEST name="hours(3600)" status=pass>>>
 *   <<<GRADER-TEST name="days(86400)" status=fail message="expected 1, got 0">>>
 *   <<<GRADER-RESULT tests-passed=3 tests-total=5>>>
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
const SENTINEL_RE = /<<<GRADER-(TEST|RESULT)\s+(.+?)>>>/g;

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
      // `Number("abc") === NaN` and `Number(undefined) === NaN`. With the
      // `?? 0` defaults a missing key resolves to 0, but a present-but-
      // unparseable value (a grader bug, a partial sentinel like
      // `tests-passed=` with no rhs, or any future format mismatch) still
      // produced NaN. NaN flowed straight into the ResultEvent, then into
      // the controller's terminal `done` event, then onto the SSE wire as
      // JSON.stringify({...,passed:NaN}) → `{"passed":null,...}`. The
      // frontend's status.inferStatus then read `event.total > 0` → false
      // (NaN/null comparison) → status stayed 'unsolved' AND
      // buildSummary returned null, so a grader that emitted a malformed
      // result line LOOKED like a grader that emitted no result at all:
      // a green-test run could come back marked unsolved with no summary,
      // with no obvious failure path to debug. Coerce NaN to 0 here so a
      // malformed grader emits something downstream consumers can read
      // (0/0 reads the same as no result line at all — the existing
      // failure mode — rather than a NaN-poisoned result line).
      const rawPassed = Number(kv['tests-passed'] ?? 0);
      const rawTotal = Number(kv['tests-total'] ?? 0);
      const passed = Number.isFinite(rawPassed) ? rawPassed : 0;
      const total = Number.isFinite(rawTotal) ? rawTotal : 0;
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
 *      ("Hello<<<GRADER-TEST...>>> world"), or an end-of-stream tail where the
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
const SENTINEL_LINE_RE = /^[ \t]*<<<GRADER-(?:TEST|RESULT)\s+.+?>>>[ \t]*\r?\n/gm;
