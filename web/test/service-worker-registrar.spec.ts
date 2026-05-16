import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression test for "stale dev SW unregister promise has no .catch".
 *
 * The dev-mode cleanup loop calls reg.unregister() on every existing
 * registration. The outer .catch on getRegistrations() does NOT propagate
 * down into those per-registration promises — each one is a detached
 * chain. If the SW state machine rejects (rare, but allowed by spec while
 * the worker is mid-installation), the result is an unhandled rejection
 * that contradicts the file's "failures are non-fatal (logged)" contract.
 *
 * This is a structural fix — a missing handler in a JSX-style chain — so
 * the regression test is source-level rather than runtime. We assert that
 * the unregister().then(...) chain has a .catch terminator.
 */
describe('ServiceWorkerRegistrar dev-mode cleanup', () => {
  let source: string;

  before(() => {
    source = fs.readFileSync(
      path.join(
        import.meta.dirname,
        '..',
        'components',
        'ServiceWorkerRegistrar.tsx',
      ),
      'utf8',
    );
  });

  it('the inner unregister().then(...) chain has a .catch handler', () => {
    // Match: reg.unregister().then(<anything>).catch(<anything>)
    // The pattern tolerates multi-line bodies inside .then(...) and
    // permissive whitespace, but requires .catch to be the next link
    // in the chain (not, say, three lines away after an intervening
    // statement).
    const pattern = /reg\.unregister\(\)\s*\.then\([\s\S]*?\}\)\s*\.catch\(/;
    assert.ok(
      pattern.test(source),
      'reg.unregister().then(...).catch(...) chain not found — the inner ' +
        'promise would surface as an unhandled rejection on SW state-machine ' +
        'reject. The outer .catch on getRegistrations() does NOT cover this.',
    );
  });

  it('the catch body logs rather than silently swallowing', () => {
    // The outer .catch(() => {}) is intentional (we genuinely don't care
    // if the entire query fails; SW is best-effort). The inner one
    // SHOULD log because we already know we had registrations to clean
    // up — silence would mean "tried to unregister, no idea what
    // happened" which is exactly the diagnostic black hole we wanted
    // to avoid.
    const inner = source.match(
      /reg\.unregister\(\)\s*\.then\([\s\S]*?\}\)\s*\.catch\(([\s\S]*?)\}\)/,
    );
    assert.ok(inner, 'inner .catch(...) body not located for inspection');
    const body = inner![1];
    assert.ok(
      /console\.(warn|error|info)/.test(body),
      `inner .catch body should log the failure — got: ${body}`,
    );
  });
});
