import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InFlightRegistry } from '../src/execution/in-flight.js';

test('acquire returns true the first time, false while held', () => {
  const r = new InFlightRegistry();
  assert.equal(r.acquire('alice:POTD0:run'), true);
  assert.equal(r.acquire('alice:POTD0:run'), false);
});

test('release lets the same key acquire again', () => {
  const r = new InFlightRegistry();
  r.acquire('alice:POTD0:run');
  r.release('alice:POTD0:run');
  assert.equal(r.acquire('alice:POTD0:run'), true);
});

test('different users can run the same problem concurrently', () => {
  const r = new InFlightRegistry();
  assert.equal(r.acquire('alice:POTD0:run'), true);
  assert.equal(r.acquire('bob:POTD0:run'), true);
});

test('a second key for the same user+problem is rejected while one is held', () => {
  // The controller composes its key as `${userId}:${id}` (no mode suffix)
  // precisely so /run and /test for the same user+problem can't race on
  // the shared per-user cmake staging tree. This test pins that property
  // at the registry layer using the same key shape the controller emits.
  const r = new InFlightRegistry();
  assert.equal(r.acquire('alice:POTD0'), true);
  assert.equal(r.acquire('alice:POTD0'), false);
});

test('size getter reflects the number of active entries', () => {
  const r = new InFlightRegistry();
  assert.equal(r.size, 0);
  r.acquire('alice:POTD0:run');
  assert.equal(r.size, 1);
  r.acquire('bob:POTD0:run');
  assert.equal(r.size, 2);
  r.release('alice:POTD0:run');
  assert.equal(r.size, 1);
});

test('onApplicationShutdown clears all active entries', () => {
  const r = new InFlightRegistry();
  r.acquire('alice:POTD0:run');
  r.acquire('bob:POTD1:test');
  r.acquire('carol:POTD2:run');
  assert.equal(r.size, 3);
  r.onApplicationShutdown('SIGTERM');
  assert.equal(r.size, 0);
  // All keys should be re-acquirable
  assert.equal(r.acquire('alice:POTD0:run'), true);
});

test('onApplicationShutdown is safe with no active entries', () => {
  const r = new InFlightRegistry();
  assert.equal(r.size, 0);
  // Should not throw
  r.onApplicationShutdown();
  assert.equal(r.size, 0);
});
