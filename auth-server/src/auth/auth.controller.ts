import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/requests.dto.js';
import {
  ApiErrorDto,
  LogoutResponseDto,
  RegisterResponseDto,
  TokenPairDto,
} from './dto/responses.dto.js';

// The front door: maps HTTP routes to AuthService methods and nothing else.
// By the time a method body runs, the ValidationPipe has already checked the
// body against its DTO class.
@ApiTags('auth')
@ApiBadRequestResponse({
  type: ApiErrorDto,
  description: 'Body failed validation, or is not valid JSON',
})
@ApiTooManyRequestsResponse({
  type: ApiErrorDto,
  description: 'Too many attempts from this client',
})
@UseGuards(ThrottlerGuard) // rate limit from ThrottlerModule.forRoot in app.module.ts
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Create an account. New accounts always get the CLIENT role.',
  })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Email is already registered',
  })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body.email, body.password);
  }

  // A POST returns 201 Created by default; nothing is created from the client's
  // point of view here, so say 200.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Exchange email + password for an access token and a refresh token',
  })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'Wrong email or password',
  })
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'Each refresh token works once. Reusing one revokes the whole session.',
  })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'Unknown, reused, revoked or expired refresh token',
  })
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the session this refresh token belongs to' })
  @ApiOkResponse({ type: LogoutResponseDto })
  logout(@Body() body: RefreshTokenDto) {
    return this.auth.logout(body.refreshToken);
  }
}
