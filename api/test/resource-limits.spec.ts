import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnLimited } from '../src/execution/resource-limits.js';
import os from 'node:os';

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
