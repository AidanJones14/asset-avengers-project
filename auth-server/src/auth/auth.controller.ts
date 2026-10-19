/**
 * HTTP boundary for shared client/staff authentication. DTO validation and throttling
 * run before AuthService; that service owns credential/session decisions. Register
 * creates CLIENT credentials only, so callers cannot grant themselves staff access.
 */

import {
  ForbiddenException,
  Header,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtraModels,
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
import { PasswordResetService } from './password-reset.service.js';
import { AuthService } from './auth.service.js';
import {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  MfaVerifyDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
} from './dto/requests.dto.js';
import {
  ApiErrorDto,
  LogoutResponseDto,
  RegisterResponseDto,
  TokenPairDto,
  MfaChallengeDto,
} from './dto/responses.dto.js';

// The front door: maps HTTP routes to AuthService methods and nothing else.
// By the time a method body runs, the ValidationPipe has already checked the
// body against its DTO class.
@ApiExtraModels(TokenPairDto, MfaChallengeDto)
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
  constructor(
    private readonly auth: AuthService,
    private readonly resets: PasswordResetService,
  ) {}

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
    return this.auth.register(
      body.email,
      body.password,
      body.firstName,
      body.lastName,
    );
  }

  // A POST returns 201 Created by default; nothing is created from the client's
  // point of view here, so say 200.
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify password and return mandatory MFA setup or login challenge',
  })
  @ApiOkResponse({ type: MfaChallengeDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'Wrong email or password',
  })
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  // Password reauthentication is required to start setup or removal. No bearer
  // token or caller-supplied user ID can substitute for proving those credentials.
  @Post('mfa/setup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Begin required authenticator enrollment using email and password',
  })
  setup(@Body() body: LoginDto) {
    return this.auth.startMfa(body.email, body.password, 'enroll');
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Confirm setup; returns recovery codes once' })
  enable(@Body() body: MfaVerifyDto) {
    return this.auth.finishMfa(body.challengeToken, body.code, 'enroll');
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Complete MFA login and receive normal application tokens',
  })
  verifyMfa(@Body() body: MfaVerifyDto) {
    return this.auth.finishMfa(body.challengeToken, body.code, 'login');
  }

  @Post('mfa/replace/start')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Prove password before replacing the authenticator',
  })
  startReplacement(@Body() body: LoginDto) {
    return this.auth.startMfa(body.email, body.password, 'replace');
  }

  @Post('mfa/replace/verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Prove old authenticator/recovery code and receive replacement QR',
  })
  verifyReplacement(@Body() body: MfaVerifyDto) {
    return this.auth.finishMfa(body.challengeToken, body.code, 'replace');
  }

  @Post('mfa/replace/enable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Confirm replacement, revoke old sessions/codes, and issue a new MFA session',
  })
  enableReplacement(@Body() body: MfaVerifyDto) {
    return this.auth.finishMfa(
      body.challengeToken,
      body.code,
      'replace-enroll',
    );
  }

  @Post(['mfa/disable/start', 'mfa/disable'])
  disable() {
    throw new ForbiddenException(
      'MFA is mandatory. Replace your authenticator instead.',
    );
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Request an emailed password reset code; same response for unknown accounts',
  })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.resets.request(body.email);
  }

  @Post('verify-reset-code')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Verify email code and issue a five-minute password-reset grant',
  })
  verifyResetCode(@Body() body: VerifyResetCodeDto) {
    return this.resets.verifyCode(body.requestToken, body.code);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Reset password using an emailed code; retain authenticator MFA',
  })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.resets.reset(body.resetToken, body.newPassword);
  }

  @Post('refresh')
  @Header('Cache-Control', 'no-store')
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
