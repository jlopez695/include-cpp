import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnLimited, shellQuote } from '../src/execution/resource-limits.js';

test('wall-clock timeout kills a long sleep', async () => {
  const start = Date.now();
  const { done } = spawnLimited('sleep 5', {
    cwd: os.tmpdir(),
    limits: { wallMs: 300 },
  });
  const result = await done;
  const elapsed = Date.now() - start;

  assert.equal(result.killedByTimeout, true);
  assert.ok(elapsed < 1500, `expected fast kill, took ${elapsed}ms`);
});

test('AbortSignal kills the child', async () => {
  const ctrl = new AbortController();
  const start = Date.now();
  const { done } = spawnLimited('sleep 5', {
    cwd: os.tmpdir(),
    limits: { wallMs: 30_000 },
    signal: ctrl.signal,
  });
  setTimeout(() => ctrl.abort(), 100);
  const result = await done;
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 1500, `expected fast abort, took ${elapsed}ms`);
  assert.notEqual(result.exitCode, 0);
});

test('fast-exiting command finishes naturally without killedByTimeout flag', async () => {
  const { done } = spawnLimited('true', {
    cwd: os.tmpdir(),
    limits: { wallMs: 5_000 },
  });
  const result = await done;
  assert.equal(result.exitCode, 0);
  assert.equal(result.killedByTimeout, false);
});

/*
 * shellQuote regression tests — these guard the entrypoint-quoting fix.
 *
 * Background: spawnLimited always wraps via `bash -c`, so any interpolated
 * path is subject to word splitting. meta.entrypoint is author-controlled
 * (problem authors set it in meta.json), and "the corpus only uses bare
 * names today" is a fragile load-bearing assumption. The shellQuote helper
 * is what makes that assumption optional — a problem with `entrypoint:
 * "my binary"` should run, not fail with `./my: not found`.
 */

test('shellQuote: wraps a bare word in single quotes', () => {
  assert.equal(shellQuote('main'), "'main'");
  assert.equal(shellQuote('./main'), "'./main'");
});

test('shellQuote: preserves whitespace inside the quotes', () => {
  assert.equal(shellQuote('./hello world'), "'./hello world'");
  assert.equal(shellQuote('./has\ttab'), "'./has\ttab'");
});

test('shellQuote: escapes embedded single quotes via close-escape-reopen', () => {
  // POSIX has no way to escape ' inside '...': you must close, emit \', reopen.
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(shellQuote("./it's mine"), "'./it'\\''s mine'");
});

test('shellQuote: defangs shell metacharacters that would otherwise expand', () => {
  // $VAR, *, ?, [...] all become literal inside single quotes.
  assert.equal(shellQuote('$PATH'), "'$PATH'");
  assert.equal(shellQuote('./glob*.txt'), "'./glob*.txt'");
  assert.equal(shellQuote('./a;rm -rf /'), "'./a;rm -rf /'");
});

test('shellQuote + spawnLimited: a binary whose path contains a space actually runs', async () => {
  // End-to-end: write an executable with a space in its name, invoke it
  // through the same pipeline cmake-runner / makefile-runner use, and
  // verify it ran (exit 0 from a 1-byte shell script). Pre-fix this would
  // have failed with "./with: No such file or directory" — bash word-split
  // before reaching exec.
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shellquote-spawn-'));
  try {
    const binPath = path.join(dir, 'with space');
    await fs.promises.writeFile(binPath, '#!/bin/sh\nexit 0\n');
    await fs.promises.chmod(binPath, 0o755);

    const { done } = spawnLimited(shellQuote('./with space'), {
      cwd: dir,
      limits: { wallMs: 5_000 },
    });
    const result = await done;
    assert.equal(result.exitCode, 0, 'spaced-path binary should run cleanly');
    assert.equal(result.killedByTimeout, false);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
