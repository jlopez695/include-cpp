import 'reflect-metadata';
import { describe, it, before, after as afterAll } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCompress from '@fastify/compress';
import { AppModule } from '../src/app.module.js';

describe('Response compression', () => {
  let app: NestFastifyApplication;

  before(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
      { logger: false },
    );
    await app.register(fastifyCompress as any, {
      encodings: ['br', 'gzip', 'deflate'],
    });
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Hit the detail endpoint — its payload (markdown + source files) is large
  // enough to clear @fastify/compress's default 1024-byte threshold. The list
  // endpoint is too small to trigger compression in production either.
  it('compresses response with gzip when Accept-Encoding is sent', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/POTD0',
      headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-encoding'], 'gzip',
      'Response should be gzip-compressed');
  });

  it('compresses response with br when Accept-Encoding includes br', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/POTD0',
      headers: { 'accept-encoding': 'br' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-encoding'], 'br',
      'Response should be brotli-compressed');
  });

  it('returns uncompressed when no Accept-Encoding is sent', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/POTD0',
      headers: { 'accept-encoding': 'identity' },
    });
    assert.equal(response.statusCode, 200);
    // Should not have content-encoding header or should be identity
    const enc = response.headers['content-encoding'];
    assert.ok(!enc || enc === 'identity', 'Should not compress when identity requested');
  });

  it('compressed response is smaller than uncompressed', async () => {
    const uncompressed = await app.inject({
      method: 'GET',
      url: '/api/problems/POTD0',
      headers: { 'accept-encoding': 'identity' },
    });
    const compressed = await app.inject({
      method: 'GET',
      url: '/api/problems/POTD0',
      headers: { 'accept-encoding': 'gzip' },
    });

    assert.equal(compressed.statusCode, 200);
    assert.ok(
      compressed.rawPayload.length < uncompressed.rawPayload.length,
      `Compressed (${compressed.rawPayload.length}B) should be smaller than uncompressed (${uncompressed.rawPayload.length}B)`,
    );
  });
});
