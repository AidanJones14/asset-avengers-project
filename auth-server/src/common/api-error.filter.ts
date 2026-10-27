import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

// The error body every endpoint returns. Same shape as ApiError in
// docs/endgame-api.yaml, so the frontend parses one format for both services.
export interface ApiError {
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { field: string; message: string }[];
}

// Default `code` per status when the thrown exception didn't set one.
const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  501: 'NOT_IMPLEMENTED',
  503: 'SERVICE_UNAVAILABLE',
};

// @Catch() with no arguments catches everything. Services just throw Nest's
// built-in exceptions (ConflictException, UnauthorizedException, ...) and this
// filter turns each one into an ApiError response.
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);
    res.status(body.status).type('application/problem+json').json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // Exceptions we built ourselves (e.g. the ValidationPipe's) already carry ApiError fields.
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response
      ) {
        return { status, ...(response as Omit<ApiError, 'status'>) };
      }
      const message =
        typeof response === 'string'
          ? response
          : (response as { message?: unknown }).message;
      return {
        // The standard reason phrase: 404 -> "Not Found", 429 -> "Too Many Requests".
        title: STATUS_CODES[status] ?? 'Error',
        status,
        code: CODES[status] ?? `HTTP_${status}`,
        detail: typeof message === 'string' ? message : undefined,
      };
    }

    // Anything else is a bug: log it, and don't leak its message to the client.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
    };
  }
}
