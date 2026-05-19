/**
 * Regression test for "grader_harness.h captures the child's stderr
 * unbounded, so a runaway test that floods stderr can OOM the parent
 * grader and take every other test's result down with it".
 *
 * Pre-fix shape (problems/_shared/grader_harness.h):
 *
 *   std::string captured;
 *   char buf[4096];
 *   ssize_t n;
 *   for (;;) {
 *       n = read(pipefd[0], buf, sizeof(buf));
 *       if (n > 0) { captured.append(buf, static_cast<size_t>(n)); continue; }
 *       ...
 *   }
 *
 * The parent grader process appended every byte of the child's stderr
 * into a single std::string with no cap. The parent runs under
 * spawnLimited's `ulimit -v 524288` (RLIMIT_AS = 512MB) and a 30s wall
 * timeout. The bad shape that follows from that:
 *
 *   - A student's code that loops printing to stderr (the most common
 *     day-one mistake: a stray `cout`/`cerr` inside a `while` they
 *     expected to terminate) drains memory until std::string::append
 *     throws std::bad_alloc.
 *   - bad_alloc escapes OUTSIDE the run_in_child try block (the try
 *     wraps only the child's body, not the parent's read loop), so
 *     std::terminate aborts the entire grader. No <<<POTD-RESULT...>>>
 *     ever reaches the parser. The SSE `done` event lands with
 *     {passed:0, total:0} and the user sees "0/0 tests passed" with
 *     no diagnostic.
 *   - More commonly the 30s wall timeout fires before bad_alloc and
 *     SIGKILLs the grader to the same opaque effect.
 *
 * The fix caps captured stderr at 64KB and keeps draining the pipe
 * past the cap so the child doesn't SIGPIPE on its next write.
 * Truncation surfaces a "[stderr truncated at 64KB]" suffix so the
 * downstream consumer can tell capped output apart from short output.
 *
 * Test shape: structural pin. A runtime test that actually OOMs the
 * grader would need a problem fixture whose grader exhausted virtual
 * memory in seconds — fiddly to keep deterministic across CI hosts
 * and would slow the suite. The cap is a source-level invariant, so
 * pinning it in source is the right shape: cheap, catches a
 * refactor that drops the cap, unambiguous about the rule the harness
 * is supposed to enforce.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('grader_harness.h captures child stderr with a memory cap', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'problems', '_shared', 'grader_harness.h'),
      'utf8',
    );
  });

  it('declares MAX_CAPTURED — the size cap is named, not a magic number', () => {
    // Pin the constant name so a future change to the cap (e.g.,
    // raising it to 128KB) updates it in one place and stays
    // grep-findable. Reject the pre-fix shape that had no constant at
    // all.
    assert.match(
      source,
      /MAX_CAPTURED\s*=\s*64\s*\*\s*1024/,
      'grader_harness.h must declare MAX_CAPTURED = 64 * 1024 — the named cap is what stops a runaway-stderr test from OOM-ing the parent grader',
    );
  });

  it('emits a "[stderr truncated at 64KB]" sentinel when the cap fires so downstream consumers can tell capped from short output', () => {
    // The literal suffix string is the user-visible signal that the
    // captured stderr was clipped. Pin it so a future refactor that
    // "cleans up the message" doesn't silently drop the diagnostic.
    assert.match(
      source,
      /\[stderr truncated at 64KB\]/,
      'grader_harness.h must append "[stderr truncated at 64KB]" when MAX_CAPTURED fires; without it a capped failure message is indistinguishable from a complete-but-short one',
    );
  });

  it('keeps draining the pipe past the cap (does NOT break out of the read loop early)', () => {
    // The cap stops the APPEND, not the read. If a future refactor
    // adds `if (captured.size() >= MAX_CAPTURED) break;`, the child's
    // next write into the pipe SIGPIPEs the child and the test crashes
    // with a confusing signal. Anchor on the shape: the size check
    // gates the append, not the read.
    //
    // We pin the absence of the pre-fix bare-append shape AND the
    // presence of the gated-append shape that uses std::min against
    // the remaining capacity.
    assert.doesNotMatch(
      source,
      /captured\.append\(buf,\s*static_cast<size_t>\(n\)\);/,
      'pre-fix `captured.append(buf, static_cast<size_t>(n));` was an unconditional append. The fix must gate the append by remaining capacity, not append unconditionally.',
    );
    assert.match(
      source,
      /std::min\(static_cast<size_t>\(n\),\s*MAX_CAPTURED\s*-\s*captured\.size\(\)\)/,
      'grader_harness.h must use std::min(n, MAX_CAPTURED - captured.size()) to gate the append by remaining capacity — see how the cap stops the append without breaking out of the read loop, so the child can finish writing without SIGPIPE',
    );
  });

  it('includes <algorithm> for std::min', () => {
    // std::min is in <algorithm>. The other includes (<sstream>,
    // <vector>) probably pull it in transitively on every libstdc++
    // we ship against today, but transitive include reliance is the
    // canonical "works on my machine, breaks on a libc++ upgrade" trap.
    // Pin the include explicitly.
    assert.match(
      source,
      /^[ \t]*#\s*include\s+<algorithm>/m,
      'grader_harness.h must #include <algorithm> for std::min — relying on transitive include from <sstream>/<vector> is fragile across libstdc++/libc++ versions',
    );
  });

  it('does NOT replace the entire read loop with a simple cap that drops EINTR handling', () => {
    // Belt-and-suspenders: the cap landed on top of the previous
    // EINTR-retry loop fix. A "let me clean up the loop" refactor
    // that uses a while-loop with a single condition and drops the
    // EINTR continue would silently bring the original bug back.
    // The grader-harness-eintr.spec.ts test already pins the EINTR
    // retry; cross-reference it here so anyone touching this loop
    // sees both invariants together.
    assert.match(
      source,
      /errno\s*==\s*EINTR[^;]*continue/,
      'the cap must layer on top of the existing EINTR-retry loop — dropping the EINTR continue silently brings back the pre-fix "signal mid-read truncates stderr" bug (see api/test/grader-harness-eintr.spec.ts)',
    );
  });
});
