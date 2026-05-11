import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ProblemsModule } from './problems/problems.module.js';
import { ExecutionModule } from './execution/execution.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 1_000, limit: 10 },
      { name: 'exec', ttl: 10_000, limit: 8 },
    ]),
    ProblemsModule,
    ExecutionModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
