import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

// Startup, in order:
//   1. NestFactory.create reads AppModule: ConfigModule validates the env, then
//      Nest creates each provider once (DB pool, repositories, services, controllers).
//   2. configureApp adds the app-wide pieces (body limit, helmet, CORS, validation, errors, Swagger).
//   3. listen starts accepting requests.
async function bootstrap() {
  // bodyParser: false because configureApp registers its own JSON parser.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app, config.get('CORS_ALLOWED_ORIGIN', { infer: true }));
  await app.listen(config.get('AUTH_SERVICE_PORT', { infer: true }));
}
await bootstrap();
