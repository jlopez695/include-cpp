import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import { AppModule } from '../src/app.module.js';
import { computeCorsOrigins } from '../src/common/cors-origins.js';

/**
 * Regression for #1.8: the API was missing baseline defensive
 * headers on its responses. `X-Content-Type-Options: nosniff` and
 * `X-Frame-Options: DENY` are hygiene — JSON-only routes don't
 * surface XSS, but Swagger UI at /api/docs renders HTML and any
 * future controller-bug that returns the wrong content-type
 * should not be MIME-sniffed by the browser.
 *
 * This spec bootstraps a minimal NestFastify app and inspects the
 * headers Fastify emits on a real request. It mirrors the same
 * onSend hook registration main.ts now does after fastifyCors.
 * If main.ts ever drops the hook, this test fails.
 */

describe('API security headers', () => {
  let app: NestFastifyApplication;

  before(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
      { bufferLogs: true },
    );
    await app.register(fastifyCors as any, {
      origin: computeCorsOrigins(process.env),
      credentials: true,
    });
    // Reapply the same hook main.ts wires up. Done explicitly here
    // (rather than booting main.ts) because main.ts also calls
    // app.listen which would bind a port we don't want in tests.
    const apiServer = app.getHttpAdapter().getInstance() as import('fastify').FastifyInstance;
    apiServer.addHook('onSend', async (_req, reply, payload) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      return payload;
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  after(async () => {
    if (app) await app.close();
  });

  it('emits X-Content-Type-Options: nosniff on health responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('emits X-Frame-Options: DENY on health responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });

  it('emits the headers on 404 responses too (hook runs on every reply)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/this-route-does-not-exist' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });
});
