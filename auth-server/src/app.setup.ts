import {
  BadRequestException,
  PayloadTooLargeException,
  ValidationPipe,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import { ApiErrorFilter } from './common/api-error.filter.js';

// This file exists so that main.ts and the end to end tests build the checks and configurations on the request / response pipeline into the nest app
// In main.ts, NestFactory.create only builds the app, dependency injection, the modules, and the routes
// Port listening, pipes, filters, swagger, and other middleware have to be configured after app is created
// We own this code to call Nest and Express APIs. It runs once at startup, and the pieces we register are run per request
export function configureApp(app: NestExpressApplication, corsOrigin: string) {
  // First we register Express middleware on the nest app
  // Express deals with requests and runs on them before handing them to nest

  // This is a header that gives away the use of underlying express js server request handling
  // An unnecessary thing to include in response headers
  app.disable('x-powered-by');
  // The browser reaches this service through nginx (frontend/nginx.conf). Without this, every
  // request appears to come from nginx's IP, and the rate limit would block all users at once.
  // 1 = trust one proxy hop: req.ip becomes the client address nginx puts in X-Forwarded-For.
  app.set('trust proxy', 1);


  // helmet() is a library call that returns middleware
  // It adds security headers to every response except the Swagger pages (/api): Swagger UI
  // needs inline scripts, which helmet's default Content-Security-Policy blocks.
  const securityHeaders = helmet();
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/api') ? next() : securityHeaders(req, res, next),
  );
  app.enableCors({ origin: corsOrigin });

  // JSON body parsing, registered here instead of by Nest (both callers create the
  // app with bodyParser: false) so its two failure cases become ApiErrors. Nest's
  // own parser would turn broken JSON into a generic 400 with no way to tell it apart.
  // It runs after helmet and CORS so those error responses still carry their headers.
  const parseJson = express.json({ limit: '10kb' });
  app.use((req: Request, res: Response, next: NextFunction) =>
    parseJson(req, res, (err?: unknown) =>
      next(err ? bodyParserError(err) : undefined),
    ),
  );

  // Lecture 10: every @Body() is validated against its DTO class, applied once here
  // instead of per route. whitelist + forbidNonWhitelisted reject undeclared fields.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          title: 'Bad Request',
          code: 'VALIDATION_FAILED',
          detail: 'Request body failed validation',
          errors: flatten(errors),
        }),
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();

  // OpenAPI generated from the decorators: UI at /api, JSON at /api-json (lecture 15).
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Endgame Auth Service')
      .setDescription(
        'Registration, login, and JWT issuance for the trading API',
      )
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('api', app, document);
}

function bodyParserError(err: unknown) {
  const type = (err as { type?: string }).type;
  if (type === 'entity.too.large') {
    return new PayloadTooLargeException({
      title: 'Payload Too Large',
      code: 'PAYLOAD_TOO_LARGE',
      detail: 'Request body is larger than 10 kB',
    });
  }
  if (type === 'entity.parse.failed') {
    return new BadRequestException({
      title: 'Bad Request',
      code: 'MALFORMED_JSON',
      detail: 'Request body is not valid JSON',
    });
  }
  return err;
}

// class-validator reports { property, constraints: { rule: message } } per field;
// ApiError wants a flat list of { field, message }.
function flatten(
  errors: ValidationError[],
  parent = '',
): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}
