import { BadRequestException, Injectable } from '@nestjs/common';
import { ProblemsService } from '../problems/problems.service.js';
import { runMakefile } from './makefile-runner.js';
import { runCmake } from './cmake-runner.js';
import type { StreamCallback } from './event-emitter.js';

@Injectable()
export class ExecutionService {
  constructor(private readonly problems: ProblemsService) {}

  /**
   * Reject any run/test request whose `files` map doesn't strictly match
   * the problem's editableFiles allowlist. Without this gate, the runners
   * would write arbitrary attacker-supplied filenames into their build
   * tree, which means:
   *   - A user could overlay `tests/grader.cpp` (a readOnlyFile) with a
   *     stub that always passes, and `/test` would report 100%.
   *   - A path-traversal filename like `../../etc/something` would
   *     resolve outside the per-user staging dir.
   * Validation lives here (not in each runner) so it runs once, before
   * the SSE stream is opened — a rejection comes back as a clean 400
   * instead of an in-stream `error` event the client has to special-case.
   * Callers should invoke this before any in-flight acquisition or
   * header flush. readMeta() throws NotFoundException for unknown ids.
   */
  validateRunRequest(problemId: string, userFiles: Record<string, string>): void {
    const meta = this.problems.readMeta(problemId);
    const allowed = new Set(meta.editableFiles);
    for (const filename of Object.keys(userFiles)) {
      if (!allowed.has(filename)) {
        throw new BadRequestException(
          `File "${filename}" is not an editable file for problem ${problemId}`,
        );
      }
    }
  }

  async runStream(
    problemId: string,
    userFiles: Record<string, string>,
    mode: 'run' | 'test',
    emit: StreamCallback,
    signal: AbortSignal,
    userId: string,
  ): Promise<{ passed: number; total: number; exitCode: number }> {
    // Defense in depth — controllers should already have called
    // validateRunRequest, but this guarantees no unvalidated path reaches
    // the runners even if a future caller forgets.
    this.validateRunRequest(problemId, userFiles);
    const meta = this.problems.readMeta(problemId);
    if (meta.buildType === 'cmake') {
      return runCmake(problemId, userFiles, mode, emit, signal, userId);
    }
    return runMakefile(problemId, userFiles, mode, meta.entrypoint, emit, signal);
  }
}
