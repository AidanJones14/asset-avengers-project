import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';


// This is the entry point (the first file that node runs)
// Starts Nest, adds the app-wide settings, then opens the port
// Node owns this and runs it, Nest builds
// async allows function to pause when making await calls
async function bootstrap() {

  // Uses AppModule from app.module.ts to create each provider once from the module definitions
  // ConfigModule validates the env, then Nest creates each provider once (DB pool, repositories, services, controllers)
  // bodyParser: false because configureApp registers its own JSON parser, this turns off Nest built in parser
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });


  // asks for settings that ConfigModule built in AppModule startup
  // <Env, true> tells typescript compiler to check key names and that values are not undefiend.
  // env.ts cannot be used directly because it is like a checklist for the actual env values and specifies type constraints

  // Flow:
  // type constraints and env vars defined in env.ts
  // ConfigModule runs when AppModule is created and reads env to set values. validateEnv checks env values
  // App ConfigService is passed these values so everything in app can use them
  // Nest Dependency Injection hands out env values to any class that requests them through the config service

  // so that is why app.get is used, because ConfigService is owned and created by app after ConfigModule runs
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // configureApp adds the app-wide pieces (body limit, helmet, CORS, validation pipe, api error filter, Swagger).
  // Only part of config it uses is the CORS allowed origin string
  configureApp(app, config.get('CORS_ALLOWED_ORIGIN', { infer: true }));

  // Sets server to listen for requests on specified port
  await app.listen(config.get('AUTH_SERVICE_PORT', { infer: true }));
}
// Makes the call to start the server with the defined steps
await bootstrap();
