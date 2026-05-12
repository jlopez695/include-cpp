import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module.js';
import { logToolchainStartupBanner } from './common/toolchain.js';
import { LoggingInterceptor } from './common/logging.interceptor.js';

const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

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

  await app.register(fastifyCors as any, {
    origin: [FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CS 225 POTD API')
    .setDescription('Code execution and problem management for CS 225 Problem of the Day')
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
