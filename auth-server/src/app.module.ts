// Nest libraries
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
// our module and controller inputs are .js because of tsconfig.json specifying module style
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

// Owned by Nest
// Used once at startup via main.ts
// @Module() runs when the class is defined and attaches the settings to AppModule.
// Nest reads them at startup.
// Object literal inside of decorator are key-value pairs that map to Nest Settings
@Module({
  // list of other modules that branch from AppModule
  // Nest opens each one and builds everything inside of the module
  imports: [
    // reads and validates .env
    ConfigModule.forRoot({
      isGlobal: true,
      // One .env for the whole repo, one level up.
      envFilePath: '../.env',
      // Tests supply their own values instead.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      // whatever validate returns is what ConfigService holds
      validate: validateEnv,
    }),
    // 20 requests per 15 minutes per client IP, on controllers that use ThrottlerGuard.
    // Each route has its own count: 20 logins and 20 registers are kept track of separately.
    ThrottlerModule.forRoot([{ ttl: 15 * 60_000, limit: 20 }]),
    // database connection pool, AuthModule does not
    // @Global decorator in database.module.ts means that database pool is available to every module automatically
    // otherwise a module can only use another module's artifact if it lists the module in its imports
    DatabaseModule,
    // register, login, refresh, logout
    AuthModule,
  ],
  controllers: [HealthController],
})
// this declares the class and makes it importable by other files
// import of AppModule in main.ts would not work without this export
// part of ES module rules that have to do with when modules are created and how they are injected
export class AppModule {}
