import { XMLParser } from 'fast-xml-parser';

export interface JUnitTest {
  name: string;
  failure: string | null;
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
 *   </testsuite>
 *
 * Real-world ctest output sometimes wraps in <testsuites>; we handle both.
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
    let failure: string | null = null;
    if (tc.failure !== undefined) {
      if (typeof tc.failure === 'string') {
        failure = tc.failure;
      } else if (tc.failure?.['#text']) {
        failure = tc.failure['#text'];
      } else if (tc.failure?.['@_message']) {
        failure = tc.failure['@_message'];
      } else {
        failure = 'failed';
      }
    }
    const timeStr = tc['@_time'];
    const durationMs = timeStr != null ? Math.round(parseFloat(timeStr) * 1000) : null;
    return { name: tc['@_name'] ?? 'unnamed', failure, durationMs };
  });

  return {
    passed: tests.filter(t => t.failure === null).length,
    total: tests.length,
    tests,
  };
}
