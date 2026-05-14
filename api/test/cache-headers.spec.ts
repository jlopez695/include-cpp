import 'reflect-metadata';
import { describe, it, before, after as afterAll } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('Cache-Control headers on problem endpoints', () => {
  let app: NestFastifyApplication;

  before(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
      { logger: false },
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/problems returns Cache-Control header', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/problems' });
    assert.equal(response.statusCode, 200);
    const cc = response.headers['cache-control'];
    assert.ok(cc, 'Cache-Control header should be present');
    assert.ok(String(cc).includes('public'), 'Cache-Control should include "public"');
    assert.ok(String(cc).includes('max-age=3600'), 'Cache-Control should include "max-age=3600"');
  });

  it('GET /api/problems/:id returns Cache-Control header', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/problems/POTD0' });
    assert.equal(response.statusCode, 200);
    const cc = response.headers['cache-control'];
    assert.ok(cc, 'Cache-Control header should be present');
    assert.ok(String(cc).includes('public'), 'Cache-Control should include "public"');
    assert.ok(String(cc).includes('max-age=3600'), 'Cache-Control should include "max-age=3600"');
  });

  it('GET /api/health does NOT have a long Cache-Control', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    const cc = response.headers['cache-control'];
    // Health should not have long cache (or no cache header at all)
    if (cc) {
      assert.ok(!String(cc).includes('max-age=3600'),
        'Health endpoint should not have 1-hour cache');
    }
  });
});
