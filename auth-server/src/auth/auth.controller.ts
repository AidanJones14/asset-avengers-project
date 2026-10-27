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
  getSchemaPath,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PasswordResetService } from './password-reset.service.js';
import { AuthService } from './auth.service.js';
import { Public } from './guards/auth-decorators.js';
import {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  MfaVerifyDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
  ChangeTemporaryPasswordDto,
} from './dto/requests.dto.js';
import {
  ApiErrorDto,
  LogoutResponseDto,
  RegisterResponseDto,
  TokenPairDto,
  MfaChallengeDto,
  PasswordChangeRequiredDto,
} from './dto/responses.dto.js';

// The front door: maps HTTP routes to AuthService methods and nothing else.
// By the time a method body runs, the ValidationPipe has already checked the
// body against its DTO class.
@ApiExtraModels(TokenPairDto, MfaChallengeDto, PasswordChangeRequiredDto)
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
// Every route here runs before a session exists, so none needs an access token (JwtAuthGuard skips them).
@Public()
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
      body.mfaEnabled ?? false,
    );
  }

  // A POST returns 201 Created by default; nothing is created from the client's
  // point of view here, so say 200.
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify password and return tokens, the required MFA challenge, or a required password change',
  })
  @ApiOkResponse({ schema: { oneOf: [
    { $ref: getSchemaPath(TokenPairDto) }, { $ref: getSchemaPath(MfaChallengeDto) },
    { $ref: getSchemaPath(PasswordChangeRequiredDto) },
  ] } })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'Wrong email or password',
  })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'ACCOUNT_DISABLED (only after a correct password)' })
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  // D3: a provisioned staff account's first login. Re-proves the temporary password (like
  // mfa/setup), sets the new one, then continues like login (for staff: the MFA enrollment challenge).
  @Post('change-temporary-password')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace a temporary password, then continue sign-in' })
  @ApiOkResponse({ schema: { oneOf: [
    { $ref: getSchemaPath(TokenPairDto) }, { $ref: getSchemaPath(MfaChallengeDto) },
  ] } })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Wrong email or temporary password' })
  changeTemporaryPassword(@Body() body: ChangeTemporaryPasswordDto) {
    return this.auth.changeTemporaryPassword(body.email, body.password, body.newPassword);
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
      'Disabling an enrolled authenticator is not supported. Replace your authenticator instead.',
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
