import { Module } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { TokenService } from './token.service.js';

// Wiring only: every controller and every class they depend on must be listed,
// or Nest fails at startup with "can't resolve dependencies" (lecture 09).
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, UsersRepository, SessionsRepository],
})
export class AuthModule {}
