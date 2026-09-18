/**
 * Regression test for "cmake /run silently invokes the Catch2 test
 * runner instead of the assignment binary".
 *
 * cmake problems (POTD64 et al.) build TWO executables in the
 * same build directory:
 *   - <buildDir>/main : the assignment entrypoint (meta.entrypoint)
 *   - <buildDir>/test : the Catch2 test runner (catch_discover_tests)
 *
 * The old findRunnableBinary just returned the first executable from
 * readdir. readdir order is filesystem-dependent — on this Mac the
 * order happens to be alphabetical (main < test) so it worked, but
 * any system that returns "test" first would have /run invoke the
 * test harness when the user clicks Run. The output panel would show
 * Catch2 progress bars instead of the program's actual output, and
 * the user would have no easy way to tell why.
 *
 * The fix: findRunnableBinary now takes meta.entrypoint and prefers
 * <buildDir>/<entrypoint> when it exists and is executable. The
 * readdir scan stays as a last-resort fallback so problems whose
 * entrypoint doesn't correspond to a built binary name don't hard-fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findRunnableBinary } from '../src/execution/cmake-runner.js';

async function mkdir(p: string) { await fs.promises.mkdir(p, { recursive: true }); }
async function touchExec(p: string) {
  await fs.promises.writeFile(p, '#!/bin/sh\n');
  await fs.promises.chmod(p, 0o755);
}

test('findRunnableBinary: prefers <buildDir>/<entrypoint> over other executables', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frb-prefer-'));
  try {
    // Put `test` first alphabetically AND lexically AND create-order-first
    // — the old heuristic would have returned `test`. The new logic must
    // return `main` because that's what meta.entrypoint says.
    await touchExec(path.join(dir, 'test'));
    await touchExec(path.join(dir, 'main'));
    const bin = await findRunnableBinary(dir, 'main');
    assert.equal(bin, './main');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('findRunnableBinary: ignores entrypoint name that is a directory, falls back to scan', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frb-dir-collision-'));
  try {
    // Defense in depth: if a directory shares the entrypoint's name (e.g.
    // a future CMakeFiles/<entrypoint> nesting), the helper must not
    // pretend it's an executable file.
    await mkdir(path.join(dir, 'main'));
    await touchExec(path.join(dir, 'app'));
    const bin = await findRunnableBinary(dir, 'main');
    assert.equal(bin, './app');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('findRunnableBinary: falls back to any executable when entrypoint is missing', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frb-fallback-'));
  try {
    await touchExec(path.join(dir, 'something'));
    // Non-executable distractor — the scan must skip it.
    await fs.promises.writeFile(path.join(dir, 'CMakeCache.txt'), 'cache');
    const bin = await findRunnableBinary(dir, 'definitely-not-built');
    assert.equal(bin, './something');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('findRunnableBinary: throws when nothing is executable', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frb-empty-'));
  try {
    // Files exist, but none are +x.
    await fs.promises.writeFile(path.join(dir, 'CMakeCache.txt'), 'cache');
    await fs.promises.writeFile(path.join(dir, 'Makefile'), '# nothing');
    await assert.rejects(
      () => findRunnableBinary(dir, 'main'),
      /No runnable binary found/,
    );
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('findRunnableBinary: works when entrypoint is the ONLY executable too', async () => {
  // Sanity: the happy path (single binary matching entrypoint) still works.
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frb-only-'));
  try {
    await touchExec(path.join(dir, 'main'));
    const bin = await findRunnableBinary(dir, 'main');
    assert.equal(bin, './main');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
