import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module.js';
import { logToolchainStartupBanner } from './common/toolchain.js';

const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

async function bootstrap() {
  logToolchainStartupBanner();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  await app.register(fastifyCors as any, {
    origin: [FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[api] listening on http://localhost:${PORT}`);
}

bootstrap().catch(err => {
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});
