import { SupersetSsoService } from './superset-sso.service.js';
import { SupersetSsoController } from './superset-sso.controller.js';
import { EmailService } from './email.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { MfaService } from './mfa.service.js';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersRepository } from '../users/users.repository.js';
import { ProfileController } from './profile.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { TokenService } from './token.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

// Wiring only: every controller and every class they depend on must be listed,
// or Nest fails at startup with "can't resolve dependencies" (lecture 09).
@Module({
  controllers: [AuthController, ProfileController, StaffController, SupersetSsoController],
  providers: [
    SupersetSsoService,
    EmailService,
    PasswordResetService,
    MfaService,
    AuthService,
    TokenService,
    UsersRepository,
    SessionsRepository,
    StaffService,
    // Global guard (applies to every controller in the app, HealthController included):
    // a valid access token is required unless the route is @Public(). APP_GUARD lets it
    // use dependency injection (TokenService), which app.useGlobalGuards() can't.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
