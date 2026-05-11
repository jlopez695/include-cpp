import {
  Body,
  ConflictException,
  Controller,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ExecutionService } from './execution.service.js';
import { InFlightRegistry } from './in-flight.js';
import type { StreamEvent } from './event-emitter.js';

interface RunBody {
  files: Record<string, string>;
  userId?: string;
}

@Controller('problems')
export class ExecutionController {
  constructor(
    private readonly execution: ExecutionService,
    private readonly inFlight: InFlightRegistry,
  ) {}

  @Throttle({ exec: { ttl: 10_000, limit: 8 } })
  @Post(':id/run')
  run(
    @Param('id') id: string,
    @Body() body: RunBody,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    return this.stream(id, body, 'run', req, res);
  }

  @Throttle({ exec: { ttl: 10_000, limit: 8 } })
  @Post(':id/test')
  test(
    @Param('id') id: string,
    @Body() body: RunBody,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    return this.stream(id, body, 'test', req, res);
  }

  private async stream(
    id: string,
    body: RunBody,
    mode: 'run' | 'test',
    req: FastifyRequest,
    res: FastifyReply,
  ): Promise<void> {
    const userId = body.userId ?? 'anonymous';
    const key = `${userId}:${id}:${mode}`;

    if (!this.inFlight.acquire(key)) {
      throw new ConflictException(`A ${mode} is already in flight for ${id}`);
    }

    const controller = new AbortController();
    req.raw.on('close', () => controller.abort());

    const origin = req.headers.origin;
    const raw = res.raw;
    raw.statusCode = 200;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no');
    if (origin) {
      raw.setHeader('Access-Control-Allow-Origin', origin);
      raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    raw.flushHeaders?.();

    const write = (event: StreamEvent) => {
      raw.write(`event: ${event.kind}\n`);
      raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await this.execution.runStream(id, body.files, mode, write, controller.signal, userId);
      write({ kind: 'done', passed: result.passed, total: result.total, exitCode: result.exitCode });
    } catch (err) {
      write({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      this.inFlight.release(key);
      raw.end();
    }
  }
}
