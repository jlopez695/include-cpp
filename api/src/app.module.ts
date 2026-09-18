import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ProblemsModule } from './problems/problems.module.js';
import { ExecutionModule } from './execution/execution.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    // Both entries are GLOBAL: ThrottlerGuard iterates exactly this list
    // for every request, and a @Throttle decorator naming a throttler
    // absent from here is silently ignored. So `exec`'s 8-per-10s budget —
    // sized for the compile/run endpoints that spawn a toolchain — also
    // applies to cheap reads unless a controller overrides it by name.
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
