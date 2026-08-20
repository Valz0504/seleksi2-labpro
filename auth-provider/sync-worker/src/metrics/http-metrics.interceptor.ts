import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, finalize, Observable, throwError } from 'rxjs';
import { WorkerMetricsService } from './worker-metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: WorkerMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    let errorStatus: number | undefined;

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        this.metrics.recordHttpRequest(
          request.method,
          this.routeLabel(request),
          errorStatus ?? response.statusCode,
          Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
        );
      }),
    );
  }

  private routeLabel(request: Request): string {
    const route = request.route as { path?: unknown } | undefined;

    return typeof route?.path === 'string' ? route.path : 'unmatched';
  }
}
