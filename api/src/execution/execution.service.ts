import { Injectable } from '@nestjs/common';
import { ProblemsService } from '../problems/problems.service.js';
import { runMakefile } from './makefile-runner.js';
import { runCmake } from './cmake-runner.js';
import type { StreamCallback } from './event-emitter.js';

@Injectable()
export class ExecutionService {
  constructor(private readonly problems: ProblemsService) {}

  async runStream(
    problemId: string,
    userFiles: Record<string, string>,
    mode: 'run' | 'test',
    emit: StreamCallback,
    signal: AbortSignal,
    userId: string,
  ): Promise<{ passed: number; total: number; exitCode: number }> {
    const meta = this.problems.readMeta(problemId);
    if (meta.buildType === 'cmake') {
      return runCmake(problemId, userFiles, mode, emit, signal, userId);
    }
    return runMakefile(problemId, userFiles, mode, meta.entrypoint, emit, signal);
  }
}
