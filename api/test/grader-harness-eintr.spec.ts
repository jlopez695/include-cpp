/**
 * Regression test for two related EINTR bugs in problems/_shared/grader_harness.h:
 *
 *   Finding 1 (HIGH): `waitpid(pid, &status, 0)` had no EINTR retry.
 *     A signal arriving mid-waitpid (SIGCHLD from a sibling test in the
 *     same run, OS timer, anything) returned -1 with errno == EINTR and
 *     left `status` at its initialized 0. Falling through to
 *     WIFEXITED(0) then evaluated `((0 & 0x7f) == 0)` → true, with
 *     WEXITSTATUS(0) == 0 → ChildResult{passed:true, "", false}. A test
 *     whose child actually crashed (or simply was never reaped) was
 *     silently scored as PASS. That's the worst failure mode in an
 *     autograder: students see a green checkmark for broken code.
 *
 *   Finding 2 (MED): the `while ((n = read(pipefd[0], buf, sizeof(buf))) > 0)`
 *     loop terminated on -1 (EINTR returns -1, same shape as end-of-stream).
 *     The captured stderr was silently truncated, and the user got back
 *     either an empty failure message (falling through to the literal
 *     "test exited non-zero" fallback) or a partial assertion message.
 *
 * Both EINTR paths are hard to exercise as deterministic runtime tests
 * because signal-delivery timing is racy by definition (the kernel
 * delivers SIGUSR1 at a syscall boundary that may or may not coincide
 * with the parent's waitpid/read). A structural pin asserting both
 * retry loops are present in source is the right shape here: cheap,
 * catches a refactor that drops either loop, and unambiguous about
 * what the bug was.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('grader_harness.h: EINTR-retry loops for read() and waitpid()', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'problems', '_shared', 'grader_harness.h'),
      'utf8',
    );
  });

  it('includes <cerrno> so the EINTR retry loops can reference errno', () => {
    assert.match(
      source,
      /^[ \t]*#\s*include\s+<cerrno>/m,
      'grader_harness.h must include <cerrno>; the EINTR retry loops compare against EINTR',
    );
  });

  it('waitpid() is wrapped in a do/while EINTR-retry loop', () => {
    // Match a do { ... waitpid(...) ... } while (... EINTR ...) shape.
    // Allow any whitespace and any condition that mentions EINTR.
    assert.match(
      source,
      /do\s*\{[^}]*waitpid\([^)]*\)[^}]*\}\s*while\s*\([^)]*EINTR[^)]*\)/s,
      'waitpid() must be wrapped in `do { ... } while (... EINTR ...)` so a signal during waitpid retries instead of falling through to WIFEXITED(0) → false PASS',
    );
  });

  it('does NOT call waitpid() unguarded by an EINTR check', () => {
    // Fail if there's a `waitpid(pid, &status, 0);` statement on its own
    // (the pre-fix shape). The retry loop has waitpid inside `do {}`,
    // not as a standalone statement, so this guards against a refactor
    // that drops the loop.
    assert.doesNotMatch(
      source,
      /^[ \t]*waitpid\(pid,\s*&status,\s*0\);[ \t]*$/m,
      'waitpid() must not appear as an unguarded standalone call — EINTR would silently produce a false PASS',
    );
  });

  it('read() pipe drain loop checks for EINTR before terminating', () => {
    // The retry pattern: somewhere in the read loop body, an
    // `errno == EINTR` check `continue`s instead of breaking.
    assert.match(
      source,
      /errno\s*==\s*EINTR[^;]*continue/,
      'read() loop must `continue` on EINTR instead of treating -1 as end-of-stream and truncating captured stderr',
    );
  });

  it('does NOT use the pre-fix `while ((n = read(...)) > 0)` shape that silently treats EINTR as EOF', () => {
    // The old shape was a tight `while (n > 0)` predicate that conflated
    // -1 (error / EINTR) with 0 (real EOF). The fix replaces it with a
    // for(;;) loop that distinguishes the cases. Reject any `while(...n > 0...)`
    // that wraps a `read(pipefd[0]...)` call.
    assert.doesNotMatch(
      source,
      /while\s*\(\s*\(?\s*n\s*=\s*read\(pipefd\[0\][^)]*\)\s*\)?\s*>\s*0\s*\)/,
      'read() loop must not use the pre-fix `while ((n = read(...)) > 0)` shape; that conflates EINTR (-1) with EOF (0) and truncates the captured stderr',
    );
  });
});
