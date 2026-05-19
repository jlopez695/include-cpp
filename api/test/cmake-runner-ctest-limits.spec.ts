import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Structural pin on the ctest spawn options in cmake-runner.ts.
 *
 * Background: spawnLimited({ ... }) reads limits from DEFAULT_LIMITS in
 * resource-limits.ts when no `limits` field is passed — that default is
 * 10s CPU / 15s wall. The configure and build spawns above the ctest
 * block both explicitly pass `{ cpuSeconds: 60, wallMs: 60_000 }`; the
 * ctest spawn previously inherited the 10s/15s defaults silently. A
 * Catch2 test suite that exceeds the 10s CPU cap got SIGKILL'd
 * mid-run, the runner read a half-written results.xml, and the user
 * saw a truncated passed/total with no indication the suite was cut
 * off. (No runtime error surface — exitCode was non-zero but the
 * partial results.xml still parsed, so passed/total looked
 * legitimate.)
 *
 * An end-to-end runtime test of this contract would require either
 * actually compiling and running a Catch2 suite that exceeds 10s of
 * CPU (too slow for a unit test, and brittle on slow CI runners) or
 * intercepting spawnLimited (which we don't have a clean seam for
 * today — refactoring runCmake to inject spawnLimited would touch
 * every test in cmake-runner.spec.ts). The structural pin below is
 * the minimum-bang-for-buck regression guard: it fails the moment
 * someone removes the explicit limits without considering the
 * defaults. The same approach is used elsewhere in this codebase
 * (see SESSION_NOTES.md's "structural pin in source + runtime test"
 * pattern — the runtime-test half lives in cmake-runner.spec.ts via
 * the real-spawn integration tests).
 */
test('cmake-runner: ctest spawnLimited call carries explicit cpuSeconds:60 / wallMs:60_000', async () => {
  const cmakeRunnerPath = fileURLToPath(
    new URL('../src/execution/cmake-runner.ts', import.meta.url),
  );
  const source = await fs.promises.readFile(cmakeRunnerPath, 'utf8');

  // Find the ctest spawn block. Match `const ctest = spawnLimited(` through
  // the closing `});` — non-greedy so we don't accidentally extend past
  // the immediate options object.
  const ctestSpawnMatch = source.match(/const ctest = spawnLimited\([\s\S]*?\}\);/);
  assert.ok(
    ctestSpawnMatch,
    `Expected a 'const ctest = spawnLimited(...)' invocation in ${path.basename(cmakeRunnerPath)}. ` +
      `If you renamed the variable, update this regression test to match.`,
  );

  const block = ctestSpawnMatch[0];

  // The exact literal values (not just "any number") — the failure mode
  // we're guarding against is regressing to the DEFAULT_LIMITS of 10s/15s,
  // so anyone changing these to a different value should also be forced
  // to re-evaluate this pin and decide whether the new value still
  // crosses the bar the comment in cmake-runner.ts documents.
  assert.match(
    block,
    /cpuSeconds:\s*60\b/,
    `ctest spawnLimited must explicitly set cpuSeconds: 60. ` +
      `Without it, spawnLimited falls back to DEFAULT_LIMITS.cpuSeconds (10s) — long Catch2 ` +
      `test suites get SIGKILL'd mid-run and the runner reports a truncated passed/total ` +
      `from a partially-written results.xml.`,
  );
  assert.match(
    block,
    /wallMs:\s*60_?000\b/,
    `ctest spawnLimited must explicitly set wallMs: 60_000. ` +
      `Without it, spawnLimited falls back to DEFAULT_LIMITS.wallMs (15_000) — long test ` +
      `suites or slow CI runners get a parent-side SIGKILL before ctest finishes writing ` +
      `results.xml.`,
  );
});
