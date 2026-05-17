import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url } = req;
    const now = performance.now();

    return next.handle().pipe(
      // Use the object form of tap so the error notification is logged
      // too. The single-callback form fires only on `next`, which means
      // every controller that throws — a 409 ConflictException when the
      // in-flight registry rejects a duplicate /run, a 404 from a typo'd
      // problem id, a 400 from validateRunRequest, a 500 from any
      // unhandled runner error — disappeared from the access log
      // entirely. The user-facing response was correct (Nest's default
      // exception filter still serialized the status + body), but the
      // server-side trail was silent on exactly the requests an
      // operator most wants to see.
      tap({
        next: () => {
          const ms = (performance.now() - now).toFixed(1);
          this.logger.log(`${method} ${url} — ${ms}ms`);
        },
        error: err => {
          const ms = (performance.now() - now).toFixed(1);
          // HttpException carries the status; everything else gets
          // bucketed at 500 so we don't quietly mark unhandled errors
          // as something more polite than they are.
          const status =
            err && typeof err.getStatus === 'function' ? err.getStatus() : 500;
          // 4xx is the user's fault (typo, duplicate click, malformed
          // body); 5xx is ours. Splitting the log level lets operators
          // filter to actual server problems without drowning in
          // client-side noise.
          const log = status >= 500 ? this.logger.error : this.logger.warn;
          log.call(
            this.logger,
            `${method} ${url} — ${status} ${ms}ms`,
          );
        },
      }),
    );
  }
}
