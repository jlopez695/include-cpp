import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyCors from '@fastify/cors';
import fastifyCompress from '@fastify/compress';
import { AppModule } from './app.module.js';
import { logToolchainStartupBanner } from './common/toolchain.js';
import { LoggingInterceptor } from './common/logging.interceptor.js';
import { computeCorsOrigins } from './common/cors-origins.js';

const PORT = Number(process.env.PORT ?? 3001);

async function bootstrap() {
  logToolchainStartupBanner();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableShutdownHooks();

  await app.register(fastifyCompress as any, {
    encodings: ['br', 'gzip', 'deflate'],
  });

  await app.register(fastifyCors as any, {
    origin: computeCorsOrigins(process.env),
    credentials: true,
  });

  // Defensive baseline security headers. The API is JSON-only for
  // every route except Swagger UI at /api/docs — so XSS via API
  // responses isn't the live threat — but `nosniff` prevents a
  // browser from MIME-guessing a JSON response as HTML or a script
  // if a future bug lets a controller return the wrong content-type,
  // and `frame-options: DENY` stops Swagger UI from being framed by
  // a different origin (clickjacking on the docs UI is low-stakes
  // but free to close). Skipping CSP intentionally: the API renders
  // no HTML it controls, and a wrong CSP applied to Swagger UI
  // (which loads its own inline scripts and styles) is more user
  // friction than the defense is worth. Done via an onSend hook so
  // it covers both the JSON paths and the SSE streaming paths — the
  // SSE handlers write to res.raw and would bypass a reply-only
  // decorator, but Fastify's onSend lifecycle still runs for them.
  // Two different fastify type packages can resolve in this monorepo
  // (the top-level fastify vs the one re-exported by
  // @nestjs/platform-fastify). The runtime instance is identical;
  // `as any` lets us register the hook without choosing a winner.
  const apiServer = app.getHttpAdapter().getInstance() as any;
  apiServer.addHook('onSend', async (_req: unknown, reply: any, payload: unknown) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('#include <cpp> API')
    .setDescription('Code execution and problem management for the C++ learning platform')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[api] listening on http://localhost:${PORT}`);
}

bootstrap().catch(err => {
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});
