import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';

test('Swagger document is generated with correct metadata', async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );

  const config = new DocumentBuilder()
    .setTitle('#include <cpp> API')
    .setDescription('Test description')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Verify top-level metadata
  assert.equal(document.info.title, '#include <cpp> API');
  assert.equal(document.info.version, '1.0');

  // Verify paths exist for our controllers
  const paths = Object.keys(document.paths ?? {});
  assert.ok(paths.some(p => p.includes('health')), 'Should have health endpoint');
  assert.ok(paths.some(p => p.includes('problems')), 'Should have problems endpoint');

  // Verify the run endpoint exists with POST method
  const runPath = paths.find(p => p.includes('run'));
  assert.ok(runPath, 'Should have a run endpoint');
  assert.ok(document.paths![runPath!]!.post, 'run endpoint should be POST');

  // Verify the test endpoint exists with POST method
  const testPath = paths.find(p => p.includes('test'));
  assert.ok(testPath, 'Should have a test endpoint');
  assert.ok(document.paths![testPath!]!.post, 'test endpoint should be POST');

  // Verify RunBodyDto schema is referenced
  const schemas = document.components?.schemas ?? {};
  assert.ok('RunBodyDto' in schemas, 'Should have RunBodyDto schema');

  await app.close();
});

test('Swagger document includes API tags on endpoints', async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );

  const config = new DocumentBuilder().setTitle('Test').setVersion('1.0').build();
  const document = SwaggerModule.createDocument(app, config);

  // Collect all tags used across endpoints
  const usedTags = new Set<string>();
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem ?? {})) {
      if (operation && typeof operation === 'object' && 'tags' in operation) {
        for (const tag of (operation as any).tags ?? []) {
          usedTags.add(tag);
        }
      }
    }
  }

  assert.ok(usedTags.has('problems'), 'Endpoints should use problems tag');
  assert.ok(usedTags.has('health'), 'Endpoints should use health tag');

  await app.close();
});
