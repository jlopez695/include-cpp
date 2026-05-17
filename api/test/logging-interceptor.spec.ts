import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { of, throwError } from 'rxjs';
import { Logger } from '@nestjs/common';
import { LoggingInterceptor } from '../src/common/logging.interceptor.js';

/** Minimal mock of Fastify request. */
function mockContext(method: string, url: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
    }),
  } as any;
}

function mockHandler(returnValue: unknown = { ok: true }) {
  return { handle: () => of(returnValue) } as any;
}

function errorHandler(err: unknown) {
  return { handle: () => throwError(() => err) } as any;
}

/**
 * Capture Nest Logger output across the prototype so a fresh
 * LoggingInterceptor's internal `new Logger('HTTP')` is observed
 * without having to inject anything. Restores on cleanup.
 */
function captureLogs() {
  const log: Array<{ level: 'log' | 'warn' | 'error'; msg: string }> = [];
  const original = {
    log: Logger.prototype.log,
    warn: Logger.prototype.warn,
    error: Logger.prototype.error,
  };
  Logger.prototype.log = function (msg: any) { log.push({ level: 'log', msg: String(msg) }); };
  Logger.prototype.warn = function (msg: any) { log.push({ level: 'warn', msg: String(msg) }); };
  Logger.prototype.error = function (msg: any) { log.push({ level: 'error', msg: String(msg) }); };
  return {
    log,
    restore() {
      Logger.prototype.log = original.log;
      Logger.prototype.warn = original.warn;
      Logger.prototype.error = original.error;
    },
  };
}

test('interceptor passes through the response value', async () => {
  const interceptor = new LoggingInterceptor();
  const result$ = interceptor.intercept(
    mockContext('GET', '/api/health'),
    mockHandler({ status: 'healthy' }),
  );

  const value = await new Promise(resolve => result$.subscribe(resolve));
  assert.deepEqual(value, { status: 'healthy' });
});

test('interceptor does not throw on POST requests', async () => {
  const interceptor = new LoggingInterceptor();
  const result$ = interceptor.intercept(
    mockContext('POST', '/api/problems/POTD0/run'),
    mockHandler(),
  );

  const value = await new Promise(resolve => result$.subscribe(resolve));
  assert.deepEqual(value, { ok: true });
});

test('interceptor handles null response', async () => {
  const interceptor = new LoggingInterceptor();
  const result$ = interceptor.intercept(
    mockContext('GET', '/api/problems'),
    mockHandler(null),
  );

  const value = await new Promise(resolve => result$.subscribe(resolve));
  assert.equal(value, null);
});

// Regression: pre-fix, the interceptor's `tap(() => ...)` only handled
// the `next` notification, so when a controller threw — a
// ConflictException (409) when the in-flight registry rejects a
// duplicate, NotFoundException (404), BadRequestException (400),
// anything else — the error propagated through the Observable
// without ever reaching this log line. The user-facing response was
// correct (Nest's default exception filter still ran), but the
// server-side access log was silent on the exact requests an
// operator most wants visibility into. Tap the error branch so they
// land in the log too.
test('interceptor logs HttpException-shaped errors as a warn at the carried status', async () => {
  const capture = captureLogs();
  try {
    const interceptor = new LoggingInterceptor();
    // Hand-roll a Nest-style error: anything with .getStatus() === 4xx
    // routes through warn (it's the user's fault).
    const err = Object.assign(new Error('A run is already in flight'), {
      getStatus: () => 409,
    });
    const result$ = interceptor.intercept(
      mockContext('POST', '/api/problems/POTD0/run'),
      errorHandler(err),
    );
    await new Promise<void>(resolve => {
      result$.subscribe({
        next: () => {},
        error: () => resolve(),
        complete: () => resolve(),
      });
    });

    const warn = capture.log.find(e => e.level === 'warn');
    assert.ok(warn, 'a 4xx error must produce a warn-level log entry');
    assert.match(warn!.msg, /POST \/api\/problems\/POTD0\/run/);
    assert.match(warn!.msg, /\b409\b/);
  } finally {
    capture.restore();
  }
});

test('interceptor logs non-HttpException (or 5xx) errors at error-level with status 500', async () => {
  const capture = captureLogs();
  try {
    const interceptor = new LoggingInterceptor();
    // A bare Error has no getStatus — the interceptor must bucket
    // it as 500, not silently relabel as 200/204/anything-else.
    const result$ = interceptor.intercept(
      mockContext('GET', '/api/problems'),
      errorHandler(new Error('boom')),
    );
    await new Promise<void>(resolve => {
      result$.subscribe({
        next: () => {},
        error: () => resolve(),
        complete: () => resolve(),
      });
    });

    const err = capture.log.find(e => e.level === 'error');
    assert.ok(err, '5xx / unknown errors must produce an error-level log entry');
    assert.match(err!.msg, /GET \/api\/problems/);
    assert.match(err!.msg, /\b500\b/);
  } finally {
    capture.restore();
  }
});

test('source pin: interceptor uses tap({next, error}), not tap(() => ...)', () => {
  // Behavioral tests above are the primary guard, but a quick
  // source-level grep makes the regression diff obvious if someone
  // converts back to the single-callback form by reflex during a
  // refactor.
  const src = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'common', 'logging.interceptor.ts'),
    'utf8',
  );
  assert.match(src, /tap\s*\(\s*\{[\s\S]*?next\s*:[\s\S]*?error\s*:[\s\S]*?\}\s*\)/);
});
