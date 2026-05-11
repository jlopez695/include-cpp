import { Module } from '@nestjs/common';
import { ProblemsController } from './problems.controller.js';
import { ProblemsService } from './problems.service.js';

@Module({
  controllers: [ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService],
})
export class ProblemsModule {}
