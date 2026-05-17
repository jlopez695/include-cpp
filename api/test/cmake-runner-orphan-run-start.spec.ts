import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runExecutable } from '../src/execution/cmake-runner.js';
import type { StreamEvent } from '../src/execution/event-emitter.js';

/**
 * Regression test: `findRunnableBinary` must run BEFORE `emit('run-start')`
 * so that an empty build dir produces no orphan run-start in the SSE
 * stream. Pre-fix the sequence was:
 *
 *   compile-start → compile-end(0) → run-start → (throw escapes)
 *
 * which the controller turned into:
 *
 *   compile-start → compile-end(0) → run-start → error
 *
 * — leaving the frontend with a run-start that was never paired with a
 * run-end. The contract is "every run-start is followed by exactly one
 * run-end before any terminal event". The fix moves the binary lookup
 * ahead of the run-start emit; when the lookup throws, the stream stays
 * silent (only the controller's final 'error' event is sent).
 */

test('runExecutable: throws WITHOUT emitting run-start when no binary is present', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cmake-no-bin-'));
  try {
    // Build dir contains files but none are executable — exactly the
    // post-compile state where catch_discover_tests wrote *_include.cmake
    // glue files but no actual binary target was produced.
    await fs.promises.writeFile(path.join(dir, 'CMakeCache.txt'), 'cache\n');
    await fs.promises.writeFile(path.join(dir, 'CMakeFiles.cmake'), '# scaffold\n');

    const events: StreamEvent[] = [];
    const ctrl = new AbortController();
    await assert.rejects(
      () => runExecutable(dir, 'main', {}, ctrl.signal, e => events.push(e)),
      /No runnable binary found/,
    );

    // The critical assertion: zero events emitted. In particular, no
    // 'run-start' — that's the orphan event the fix prevents. The
    // controller's catch will translate the rejection into an 'error'
    // event one frame up the stack, which (paired with no run-start)
    // is a well-formed terminal stream.
    assert.deepEqual(events, [], 'no events should be emitted when the binary lookup fails');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('runExecutable: emits run-start then run-end on the happy path', async () => {
  // Sanity pin: the helper actually runs binaries when one is present.
  // Without this, the orphan-prevention test above could pass trivially
  // if the helper were refactored to never emit anything.
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cmake-happy-'));
  try {
    const binPath = path.join(dir, 'main');
    await fs.promises.writeFile(binPath, '#!/bin/sh\necho hello\n');
    await fs.promises.chmod(binPath, 0o755);

    const events: StreamEvent[] = [];
    const ctrl = new AbortController();
    const result = await runExecutable(dir, 'main', { ...process.env }, ctrl.signal, e => events.push(e));

    assert.equal(result.exitCode, 0);
    const kinds = events.map(e => e.kind);
    assert.equal(kinds[0], 'run-start', 'first event should be run-start');
    assert.equal(kinds[kinds.length - 1], 'run-end', 'last event should be run-end');
    assert.equal(
      kinds.filter(k => k === 'run-start').length,
      1,
      'exactly one run-start',
    );
    assert.equal(
      kinds.filter(k => k === 'run-end').length,
      1,
      'exactly one run-end',
    );
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
