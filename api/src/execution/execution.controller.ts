import {
  Body,
  ConflictException,
  Controller,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ExecutionService } from './execution.service.js';
import { InFlightRegistry } from './in-flight.js';
import { RunBodyDto } from './run-body.dto.js';
import type { StreamEvent } from './event-emitter.js';
import { computeCorsOrigins } from '../common/cors-origins.js';

// Resolve the CORS allowlist once at module load. The /run and /test
// handlers below write to `res.raw` directly so they can stream SSE,
// which bypasses @fastify/cors's reply abstraction — the plugin's
// onSend hook never fires for raw-stream bodies. Without this manual
// check the controller used to echo `req.headers.origin` straight back
// into Access-Control-Allow-Origin with Access-Control-Allow-Credentials:
// true, defeating the global allowlist for the single most sensitive
// endpoint in the app (the one that compiles and runs user C++). Cache
// in a Set for O(1) lookups; the list is small but the check runs once
// per SSE handshake, and every request shouldn't re-parse env vars.
const ALLOWED_ORIGINS = new Set(computeCorsOrigins(process.env));

@ApiTags('problems')
@Controller('problems')
export class ExecutionController {
  constructor(
    private readonly execution: ExecutionService,
    private readonly inFlight: InFlightRegistry,
  ) {}

  @ApiOperation({ summary: 'Run user code for a problem' })
  @ApiParam({ name: 'id', description: 'Problem ID', example: 'POTD0' })
  @ApiBody({ type: RunBodyDto })
  @ApiResponse({ status: 200, description: 'SSE stream of execution events' })
  @ApiResponse({ status: 409, description: 'A run is already in flight' })
  @Throttle({ exec: { ttl: 10_000, limit: 8 } })
  @Post(':id/run')
  run(
    @Param('id') id: string,
    @Body() body: RunBodyDto,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    return this.stream(id, body, 'run', req, res);
  }

  @ApiOperation({ summary: 'Test user code for a problem' })
  @ApiParam({ name: 'id', description: 'Problem ID', example: 'POTD0' })
  @ApiBody({ type: RunBodyDto })
  @ApiResponse({ status: 200, description: 'SSE stream of execution events' })
  @ApiResponse({ status: 409, description: 'A run is already in flight' })
  @Throttle({ exec: { ttl: 10_000, limit: 8 } })
  @Post(':id/test')
  test(
    @Param('id') id: string,
    @Body() body: RunBodyDto,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    return this.stream(id, body, 'test', req, res);
  }

  private async stream(
    id: string,
    body: RunBodyDto,
    mode: 'run' | 'test',
    req: FastifyRequest,
    res: FastifyReply,
  ): Promise<void> {
    // Validate the submitted filenames BEFORE acquiring an in-flight slot
    // or flushing SSE headers, so a bad-shape request comes back as a
    // proper 400 (or 404 for an unknown id) instead of a streamed error
    // event. This also means we don't burn an in-flight slot on a request
    // that was never going to run.
    this.execution.validateRunRequest(id, body.files);

    const userId = body.userId ?? 'anonymous';
    // Key is per (user, problem) — NOT per (user, problem, mode). /run and
    // /test for the same user+problem share the per-user cmake staging tree
    // at .builds/<user>/<problem>/{src,build}; running both concurrently
    // races on mirrorDir, cmake configure, cmake --build, and ctest's
    // results.xml. A second operation must wait for the first to finish
    // (or get a 409) rather than corrupting the build dir.
    const key = `${userId}:${id}`;

    if (!this.inFlight.acquire(key)) {
      throw new ConflictException(`An execution is already in flight for ${id}`);
    }

    const controller = new AbortController();
    let clientGone = false;
    req.raw.on('close', () => {
      clientGone = true;
      controller.abort();
    });

    const origin = req.headers.origin;
    const raw = res.raw;
    raw.statusCode = 200;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no');
    // Validate the request origin against the same allowlist
    // @fastify/cors uses in main.ts. Pre-fix this block echoed
    // req.headers.origin straight back into Access-Control-Allow-Origin
    // — meaning a page on https://evil.example.com could open a
    // credentialed EventSource to /api/problems/:id/run and read the
    // streamed compile output. The plugin-registered onSend hook does
    // NOT fire for raw-stream bodies because the SSE handler bypasses
    // res.send(); the allowlist therefore has to be checked here too.
    // On an unknown origin we just don't set the header — the browser
    // then blocks the response per the CORS spec; we don't 403 because
    // a same-origin or non-browser client (curl, internal health probe)
    // shouldn't need the header at all.
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      raw.setHeader('Access-Control-Allow-Origin', origin);
      raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    raw.flushHeaders?.();

    // When the client disconnects mid-stream we abort the spawned child,
    // but the child's stdout/stderr can still flush buffered chunks for
    // a few ticks after SIGKILL — and the makefile-runner's on-end
    // handler ALSO emits any unparsed tail. Each of those reaches this
    // `write` callback, and a raw.write() on a destroyed ServerResponse
    // throws ERR_STREAM_WRITE_AFTER_END. Without this guard the throw
    // escapes the data-event listener, lands as an uncaughtException,
    // and on the wrong day takes down the Node process. Once we know
    // the client is gone there is nothing useful to send anyway — drop
    // the event instead of forcing the spawn output through a closed
    // socket.
    const write = (event: StreamEvent) => {
      if (clientGone) return;
      try {
        raw.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // The socket was destroyed between the clientGone check and the
        // write — the 'close' event fires asynchronously and a write
        // already in flight can lose the race. Flag clientGone so any
        // queued chunks behind this one short-circuit without retrying.
        clientGone = true;
      }
    };

    try {
      const result = await this.execution.runStream(id, body.files, mode, write, controller.signal, userId);
      write({ kind: 'done', passed: result.passed, total: result.total, exitCode: result.exitCode });
    } catch (err) {
      write({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      this.inFlight.release(key);
      if (!clientGone) {
        try { raw.end(); } catch { /* already-destroyed socket is fine */ }
      }
    }
  }
}
