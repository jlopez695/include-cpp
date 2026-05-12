import { test } from 'node:test';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
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
