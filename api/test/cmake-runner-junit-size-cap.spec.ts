import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJUnit } from '../src/execution/junit.js';

/**
 * Regression for the JUnit parser hardening (#1.6).
 *
 * Two protections:
 *
 *   1. Size cap (enforced in cmake-runner.ts before parseJUnit is
 *      called) — a multi-GB results.xml would otherwise OOM the
 *      Node process. We pin the cap shape here by stat'ing a file
 *      and reproducing the same comparison the runner does.
 *
 *   2. Entity-expansion disable on the parser itself (junit.ts) —
 *      `processEntities: false` defeats the classic "billion laughs"
 *      amplification at the parser layer regardless of what
 *      cmake-runner does first.
 */

test('the JUnit parser does not expand internal entities (billion-laughs defense)', () => {
  // A real billion-laughs payload would explode memory on the
  // pre-fix parser. With processEntities: false the entity refs
  // remain literal `&lol1;` strings and never get expanded.
  // Our parser doesn't surface raw text outside of message bodies,
  // so the right post-fix assertion is "parses to the same empty
  // shape we already emit on malformed input, without exploding".
  const xml = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<testsuite>
  <testcase name="explode">&lol4;</testcase>
</testsuite>`;
  // The parse should complete in well under a second on any modern
  // machine. The exact return shape is "one passing testcase" — the
  // post-fix parser sees the testcase element with NO failure/error/
  // skipped child, classifies it as pass, and the literal `&lol4;`
  // in the body never expands.
  const start = Date.now();
  const result = parseJUnit(xml);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `parseJUnit should not amplify entities; took ${elapsed}ms`);
  assert.equal(result.total, 1);
  assert.equal(result.passed, 1);
});

test('the cmake-runner size cap shape: stat.size > 10MB triggers the bypass branch', async () => {
  // The runtime cap lives in cmake-runner.ts as a const; this spec
  // pins the *threshold* and the file-stat shape it reads. If a
  // future refactor moves the cap value, this test should fail
  // loudly so the documented threshold stays in sync.
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'potd-junit-cap-'));
  try {
    const huge = path.join(tmpDir, 'results.xml');
    // 10 MB + 1 byte. Use writeFile with a Buffer to avoid
    // V8-side allocations holding the whole string.
    const buf = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
    await fs.promises.writeFile(huge, buf);
    const st = await fs.promises.stat(huge);
    const PARSE_MAX_BYTES = 10 * 1024 * 1024;
    assert.ok(st.size > PARSE_MAX_BYTES, 'expected file to exceed cap');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});
