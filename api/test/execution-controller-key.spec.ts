/**
 * Regression test for "/run and /test for the same user+problem race on
 * the shared cmake build dir".
 *
 * cmake-runner stages every user's per-problem source + build tree at
 *   .builds/<userId>/<problemId>/{src,build}
 * and reuses it across calls so ccache + ninja's incremental builds stay
 * warm. That reuse is only safe under a per-(user, problem) mutex.
 *
 * Originally the controller composed its in-flight key as
 *   `${userId}:${id}:${mode}`
 * which meant /run and /test for the same user+problem could be in flight
 * simultaneously, racing on mirrorDir, `cmake configure`, `cmake --build`,
 * and ctest's results.xml. Symptoms ranged from corrupted object files to
 * one operation's results.xml getting clobbered before the controller
 * parsed it.
 *
 * The fix is to drop `mode` from the key so the second operation comes
 * back as a clean 409 instead of racing. This test pins that the
 * controller still composes the key without the mode suffix.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('ExecutionController in-flight key shape', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'execution', 'execution.controller.ts'),
      'utf8',
    );
  });

  it('composes the in-flight key as `${userId}:${id}` — without a `:${mode}` suffix', () => {
    // Find the line where `key` is assigned from a template literal that
    // includes userId and id. There must be exactly one such assignment.
    const keyAssignmentRe = /const\s+key\s*=\s*`([^`]+)`/g;
    const matches = [...source.matchAll(keyAssignmentRe)];
    assert.equal(matches.length, 1, 'expected exactly one `const key = `...`` assignment in the controller');
    const template = matches[0]![1];

    // The template must reference both userId and id...
    assert.match(template, /\$\{userId\}/);
    assert.match(template, /\$\{id\}/);
    // ...and must NOT include mode (the bug we're guarding against).
    assert.doesNotMatch(template, /\$\{mode\}/);
  });

  it('still rejects a duplicate acquisition with a ConflictException', () => {
    // Sanity: the lock-failure branch is still wired to ConflictException
    // (not silently swallowed) so the client gets a clean 409.
    assert.match(source, /if\s*\(\s*!\s*this\.inFlight\.acquire\(key\)\s*\)\s*\{[\s\S]*?throw new ConflictException/);
  });
});
