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
      tap(() => {
        const ms = (performance.now() - now).toFixed(1);
        this.logger.log(`${method} ${url} — ${ms}ms`);
      }),
    );
  }
}
