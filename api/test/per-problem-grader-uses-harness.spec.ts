/**
 * Regression test for "per-problem graders skip the sentinel framework
 * and the API can't parse their results".
 *
 * The API parses test outcomes via parseSentinels() in sentinel.ts, which
 * matches `<<<POTD-TEST ...>>>` and `<<<POTD-RESULT ...>>>` lines. The
 * canonical way to emit those lines is the harness in
 * `problems/_shared/grader_harness.h` (POTD_TEST + POTD_ASSERT*). A
 * grader that prints `[PASS]`/`[FAIL]` text and returns exit 0/1 (the
 * old POTD1/POTD2/POTD3 shape) does NOT emit sentinels — so the
 * controller's terminal `done` event reports `{passed:0, total:0}`
 * regardless of whether the user's code is correct. Concrete user-visible
 * consequence: OutputPanel shows "0/0 tests passed", the sidebar status
 * dot can never flip to 'solved', and useProblemEditor.onDone's
 * `if (total > 0 && passed === total) recordSolveDate()` can never fire.
 *
 * Pin the contract in source so a future PR that adds a new problem with
 * the old [PASS]/[FAIL] shape (or reverts one of POTD1/2/3 to it) fails
 * CI before it lands. Specifically for every Makefile-based problem:
 *   - tests/grader.cpp must #include "grader_harness.h"
 *   - tests/grader.cpp must call POTD_TEST(...) at least once
 *   - the Makefile's test target must pass -I$(SHARED_INCLUDE) so the
 *     harness header resolves
 *
 * CMake-based problems (POTD64) use Catch2 instead and are excluded here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../src/common/paths.js';

describe('per-problem graders emit sentinel-shaped results via the harness', () => {
  const ids = fs
    .readdirSync(PROBLEMS_DIR)
    .filter(name => !name.startsWith('_') && !name.startsWith('.'))
    .filter(name => fs.existsSync(path.join(PROBLEMS_DIR, name, 'Makefile')))
    .filter(name => fs.existsSync(path.join(PROBLEMS_DIR, name, 'tests', 'grader.cpp')))
    .sort();

  it('finds at least three Makefile problems with a grader to audit', () => {
    // Sanity floor: the audit was done against POTD0–POTD3, all of which
    // are Makefile-based with a grader.cpp. An empty audit set would
    // silently pass with zero assertions; pin the floor instead.
    assert.ok(
      ids.length >= 3,
      `expected ≥3 Makefile problems with a tests/grader.cpp under PROBLEMS_DIR (${PROBLEMS_DIR}); got ${ids.length}`,
    );
  });

  for (const id of ids) {
    const graderPath = path.join(PROBLEMS_DIR, id, 'tests', 'grader.cpp');
    const makefilePath = path.join(PROBLEMS_DIR, id, 'Makefile');
    const graderSource = fs.readFileSync(graderPath, 'utf8');
    const makefileSource = fs.readFileSync(makefilePath, 'utf8');

    it(`${id}/tests/grader.cpp includes the harness header`, () => {
      assert.match(
        graderSource,
        /^[ \t]*#\s*include\s+"grader_harness\.h"/m,
        `${id}/tests/grader.cpp must #include "grader_harness.h". A grader that doesn't include the harness can't emit <<<POTD-TEST>>>/<<<POTD-RESULT>>> sentinels, so the API reports 0/0 passed regardless of actual outcome.`,
      );
    });

    it(`${id}/tests/grader.cpp registers at least one POTD_TEST`, () => {
      assert.match(
        graderSource,
        /\bPOTD_TEST\s*\(/,
        `${id}/tests/grader.cpp must call POTD_TEST(...) at least once. Without registered tests the harness's potd::run_all() emits zero per-test sentinels and a result event with total=0.`,
      );
    });

    it(`${id}/tests/grader.cpp does NOT use the pre-fix [PASS]/[FAIL] string output pattern`, () => {
      // Manual check() helper printing [PASS]/[FAIL] is the legacy
      // pattern the harness replaces. Reject any literal "[PASS]" or
      // "[FAIL]" string inside the grader to keep a refactor from
      // sliding back into the unparseable shape.
      assert.doesNotMatch(
        graderSource,
        /"\[PASS\]"|"\[FAIL\]"/,
        `${id}/tests/grader.cpp must not print "[PASS]"/"[FAIL]" — those strings aren't parsed by sentinel.ts. Use POTD_TEST/POTD_ASSERT* macros from grader_harness.h instead.`,
      );
    });

    it(`${id}/Makefile test: target passes -I$(SHARED_INCLUDE) so grader_harness.h resolves`, () => {
      // Capture the `test:` target line PLUS its recipe lines (each
      // recipe line is tab-prefixed in Makefile syntax). The target
      // ends at the next line that isn't tab-prefixed. POTD1/2/3 used
      // to omit -I$(SHARED_INCLUDE), so even with the harness include
      // in grader.cpp the test target wouldn't compile.
      const testTargetMatch = makefileSource.match(/^test\s*:[^\n]*\n(?:\t[^\n]*\n?)*/m);
      assert.ok(testTargetMatch, `${id}/Makefile must declare a \`test:\` target`);
      const testTargetBody = testTargetMatch![0];
      assert.match(
        testTargetBody,
        /-I\$\(SHARED_INCLUDE\)/,
        `${id}/Makefile test: target must include -I$(SHARED_INCLUDE) so grader_harness.h resolves. Compare against POTD0/Makefile for the canonical shape.`,
      );
    });
  }
});
