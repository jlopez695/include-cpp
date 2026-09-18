/**
 * Regression test for "next build dies with a 429 partway through static
 * generation".
 *
 * ThrottlerModule.forRoot registers `default` (10/sec) and `exec`
 * (8 per 10s). Both are GLOBAL: ThrottlerGuard iterates exactly that list
 * for every request, so `exec` — sized for the endpoints that spawn a
 * compiler — also governed the cached problem reads. `next build` fetches
 * every problem during static generation and got a 429 on the 9th, which
 * failed the whole build.
 *
 * A @Throttle decorator naming a throttler that is absent from the root
 * list is silently ignored, so the fix cannot be "drop exec from the root
 * config" — that would disable the execution limit instead of scoping it.
 * ProblemsController overrides both buckets by name instead.
 *
 * Metadata keys are `THROTTLER:LIMIT<name>` (@nestjs/throttler's
 * throttler.constants, not re-exported from the package index).
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProblemsController } from '../src/problems/problems.controller.js';
import { ExecutionController } from '../src/execution/execution.controller.js';

const LIMIT = 'THROTTLER:LIMIT';

// Static generation fetches every problem, so the ceiling has to clear the
// corpus size with room to grow rather than sit just above today's count.
const MIN_LIMIT_FOR_STATIC_BUILD = 100;

test('problem reads override both root throttlers, so a static build is not rate-limited', () => {
  for (const name of ['default', 'exec']) {
    const limit = Reflect.getMetadata(LIMIT + name, ProblemsController);
    assert.equal(
      typeof limit,
      'number',
      `ProblemsController must override the '${name}' throttler. Both are global, so leaving one at its root value lets it govern cached problem reads — that is what broke next build.`,
    );
    assert.ok(
      limit >= MIN_LIMIT_FOR_STATIC_BUILD,
      `ProblemsController's '${name}' limit is ${limit}, below the ${MIN_LIMIT_FOR_STATIC_BUILD} a static build needs.`,
    );
  }
});

test('execution endpoints keep the strict exec budget', () => {
  // The fix must not have loosened the endpoints that actually spawn a
  // toolchain. These keep exec's real limit.
  for (const handler of ['run', 'test'] as const) {
    const method = ExecutionController.prototype[handler] as unknown as object;
    const limit = Reflect.getMetadata(LIMIT + 'exec', method);
    assert.equal(
      limit,
      8,
      `ExecutionController.${handler} should still be capped at 8 requests per exec window`,
    );
  }
});
