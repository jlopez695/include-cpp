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

/** Strip sentinel lines from a chunk so they don't render in user-visible output. */
export function stripSentinels(chunk: string): string {
  return chunk.replace(SENTINEL_RE, '').replace(/^[ \t]*\n/gm, '');
}
