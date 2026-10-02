import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

// The root module. NestFactory.create(AppModule) in main.ts reads this, then
// builds every provider and controller listed here and in the imported modules.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // One .env for the whole repo, one level up. Tests supply their own values instead.
      envFilePath: '../.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    // 20 requests per 15 minutes per client IP, on controllers that use ThrottlerGuard.
    // Each route has its own count: 20 logins and 20 registers are separate budgets.
    ThrottlerModule.forRoot([{ ttl: 15 * 60_000, limit: 20 }]),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
