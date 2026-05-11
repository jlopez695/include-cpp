import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller.js';
import { ExecutionService } from './execution.service.js';
import { InFlightRegistry } from './in-flight.js';
import { ProblemsModule } from '../problems/problems.module.js';

@Module({
  imports: [ProblemsModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, InFlightRegistry],
})
export class ExecutionModule {}
