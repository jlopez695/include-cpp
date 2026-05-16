import { XMLParser } from 'fast-xml-parser';

export type JUnitStatus = 'pass' | 'fail' | 'skip' | 'error';

export interface JUnitTest {
  name: string;
  status: JUnitStatus;
  /**
   * Message body for non-pass results. Null for `pass`. For `fail` this is the
   * failure text/message; for `error` it's the error text/message; for `skip`
   * it's the skip reason if ctest provided one (often null).
   */
  message: string | null;
  durationMs: number | null;
}

export interface JUnitResult {
  passed: number;
  total: number;
  tests: JUnitTest[];
}

/**
 * Parse `ctest --output-junit` output. The shape is roughly:
 *
 *   <testsuite>
 *     <testcase name="..." />
 *     <testcase name="..."><failure message="..." /></testcase>
 *     <testcase name="..."><skipped message="..." /></testcase>
 *     <testcase name="..."><error message="..." /></testcase>
 *   </testsuite>
 *
 * Real-world ctest output sometimes wraps in <testsuites>; we handle both.
 *
 * `<skipped>` and `<error>` matter because a testcase without a `<failure>`
 * child is NOT necessarily a passing test — ctest emits `<skipped>` for tests
 * with the DISABLED property or a SKIP_REGULAR_EXPRESSION hit, and `<error>`
 * for tests that couldn't run (binary missing, fixture failed, crashed before
 * reporting). Treating those as passes inflates the pass count and lets a
 * problem be marked solved when no real assertion has actually succeeded.
 */
export function parseJUnit(xml: string): JUnitResult {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return { passed: 0, total: 0, tests: [] };
  }
  const root = doc?.testsuite ?? doc?.testsuites?.testsuite ?? doc?.testsuites;
  if (!root) return { passed: 0, total: 0, tests: [] };

  const cases = Array.isArray(root.testcase)
    ? root.testcase
    : root.testcase
      ? [root.testcase]
      : [];

  const tests: JUnitTest[] = cases.map((tc: any) => {
    // Precedence when multiple children are present (shouldn't happen in well-
    // formed ctest output, but be defensive): failure > error > skipped. A
    // failure is the most actionable signal; a skip is the least.
    let status: JUnitStatus = 'pass';
    let message: string | null = null;
    if (tc.failure !== undefined) {
      status = 'fail';
      message = extractChildText(tc.failure) ?? 'failed';
    } else if (tc.error !== undefined) {
      status = 'error';
      message = extractChildText(tc.error) ?? 'errored';
    } else if (tc.skipped !== undefined) {
      status = 'skip';
      message = extractChildText(tc.skipped);
    }
    const timeStr = tc['@_time'];
    const durationMs = timeStr != null ? Math.round(parseFloat(timeStr) * 1000) : null;
    return { name: tc['@_name'] ?? 'unnamed', status, message, durationMs };
  });

  return {
    passed: tests.filter(t => t.status === 'pass').length,
    total: tests.length,
    tests,
  };
}

/**
 * Pull the message out of a junit child element (<failure>, <error>,
 * <skipped>). fast-xml-parser hands these back as a string for self-closing
 * with no body, or an object carrying `@_message` (attribute) and/or `#text`
 * (body) depending on which the writer used. ctest itself prefers `@_message`,
 * but other JUnit producers (Catch2's reporters, GoogleTest) put the text in
 * the element body, so we handle both.
 */
function extractChildText(child: unknown): string | null {
  if (child === null || child === undefined) return null;
  if (typeof child === 'string') return child || null;
  if (typeof child === 'object') {
    const obj = child as Record<string, unknown>;
    const text = typeof obj['#text'] === 'string' ? (obj['#text'] as string) : null;
    if (text) return text;
    const msg = typeof obj['@_message'] === 'string' ? (obj['@_message'] as string) : null;
    if (msg) return msg;
  }
  return null;
}
