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
  // Locate the <testsuite> node(s). Three real-world shapes:
  //   1. <testsuite>…</testsuite>                     → doc.testsuite (object)
  //   2. <testsuites><testsuite>…</testsuite></…>     → doc.testsuites.testsuite (object)
  //   3. <testsuites>
  //        <testsuite>…</testsuite>
  //        <testsuite>…</testsuite>
  //      </testsuites>                                → doc.testsuites.testsuite (array)
  //
  // Pre-fix shape 3 silently dropped EVERY testcase. The old code reduced
  // every shape to a single `root` value, then read `root.testcase` —
  // which is `undefined` when `root` is an array, so `cases` became `[]`
  // and the whole run reported 0/0. ctest emits shape 3 whenever a build
  // registers more than one test binary (multiple add_test invocations,
  // or catch_discover_tests called for more than one Catch2 binary), so
  // the corner case is realistic enough that "looks 0/0 because there
  // were two test executables" is a credible support ticket.
  //
  // Normalize to an array of suites instead, and flatten testcases out
  // of each. Shape 1 wraps to a 1-element array; shapes 2 and 3 both
  // resolve via doc.testsuites.testsuite (object or array). Empty
  // <testsuites/> (no inner suite) collapses to []. Other XML shapes
  // (a bare `doc.testsuites` object with neither testsuite nor testcase)
  // also collapse to [] safely.
  const suiteNode = doc?.testsuite ?? doc?.testsuites?.testsuite;
  const suites: any[] = suiteNode == null
    ? []
    : Array.isArray(suiteNode) ? suiteNode : [suiteNode];
  if (suites.length === 0) return { passed: 0, total: 0, tests: [] };

  const cases: any[] = [];
  for (const suite of suites) {
    if (Array.isArray(suite.testcase)) cases.push(...suite.testcase);
    else if (suite.testcase) cases.push(suite.testcase);
  }

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
    // `@_time` is documented as seconds-as-float (e.g. "0.123"), but it
    // arrives as a string from the XML attribute and a malformed or empty
    // attribute parses as NaN — `parseFloat("")`, `parseFloat("nan")`,
    // `parseFloat("inf")`, anything non-numeric. Pre-fix that NaN flowed
    // straight through to durationMs: the type said `number | null` but
    // the runtime value was NaN. JSON.stringify silently coerces NaN to
    // null on the wire, so the bug was invisible at the SSE boundary —
    // but any in-process consumer that read durationMs before serialization
    // (a future log line, a metric, a server-side render of the duration
    // pill) would have surfaced "NaNms" or quietly skewed an aggregation.
    // Reject non-finite durations explicitly so the type stops lying and
    // the wire payload doesn't depend on JSON.stringify's NaN→null
    // coercion to look correct.
    const timeStr = tc['@_time'];
    let durationMs: number | null = null;
    if (timeStr != null) {
      const seconds = parseFloat(timeStr);
      if (Number.isFinite(seconds)) durationMs = Math.round(seconds * 1000);
    }
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
