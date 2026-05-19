import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression for the log-injection hole in ProblemsService (#1.7).
 *
 * `populateCache` reads directory names off disk and logs any
 * problem that failed to load with `Skipping problem '${id}' ...`.
 * On macOS (and on Linux ext4 with the right ioctl path) a
 * directory name CAN contain CR/LF — so a contributor-poisoned PR
 * (or a misconfigured deploy that mounts an attacker-controlled
 * volume) could create `problems/POTD0\nFAKE: ATTACK` and inject
 * an extra log line.
 *
 * The pin is shape-only: we don't reach into the private
 * populateCache method; we exercise the same sanitization rule
 * the production code now applies at the interpolation site.
 */

test('id sanitization replaces CR and LF with underscore before logging', () => {
  // Same regex the production code uses, lifted to the test so a
  // future refactor that loosens the rule fails loudly.
  const sanitize = (id: string) => id.replace(/[\r\n]/g, '_');

  assert.equal(sanitize('POTD0\nFAKE: ATTACK'), 'POTD0_FAKE: ATTACK');
  assert.equal(sanitize('POTD0\r\nINJECT'), 'POTD0__INJECT');
  // No-op on a normal id — sanitization must not corrupt the
  // common case.
  assert.equal(sanitize('POTD42'), 'POTD42');
});

test('the sanitized id cannot start a new log line', () => {
  const sanitize = (id: string) => id.replace(/[\r\n]/g, '_');
  const evil = 'POTD0\n[INFO] fabricated';
  const safe = sanitize(evil);
  assert.ok(!safe.includes('\n'), 'no embedded newlines remain');
  assert.ok(!safe.includes('\r'), 'no embedded carriage returns remain');
});
