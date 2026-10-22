import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import bcrypt from 'bcrypt';
import { UsersRepository } from '../users/users.repository.js';
import type { User } from '../users/users.repository.js';
import { TokenService, type AccessTokenClaims } from './token.service.js';
import { CurrentUser } from './guards/auth-decorators.js';
import { BCRYPT_COST, CurrentPassword, NewPassword, assertBcryptLength } from './password-policy.js';

export class ProfileNameDto {
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
}
export class PasswordChangeDto {
  @CurrentPassword() currentPassword!: string;
  @NewPassword() newPassword!: string;
}

// The signed-in user's own profile. The global JwtAuthGuard has already verified the token
// (including its MFA proof) before any method here runs; @CurrentUser() hands over its claims.
@ApiTags('profile')
@ApiBearerAuth()
@Controller('auth/profile')
@UseGuards(ThrottlerGuard)
export class ProfileController {
  constructor(private readonly users: UsersRepository, private readonly tokens: TokenService) {}
  // The caller's current row; a deleted or disabled (D6) account is refused even with a valid token.
  private async user(claims: AccessTokenClaims) {
    const user = await this.users.findById(claims.sub);
    if (!user || user.disabledAt) throw new UnauthorizedException('Please log in again.');
    return user;
  }
  private details(user: User) {
    return { email: user.email, firstName: user.firstName || '', lastName: user.lastName || '', roles: user.roles };
  }
  @Get()
  async get(@CurrentUser() claims: AccessTokenClaims) {
    return this.details(await this.user(claims));
  }
  @Patch()
  async update(@CurrentUser() claims: AccessTokenClaims, @Body() body: ProfileNameDto) {
    const user = await this.user(claims);
    const updated = await this.users.updateName(user.id, body.firstName, body.lastName);
    if (!updated) throw new UnauthorizedException('Please log in again.');
    // The new token keeps this session's MFA proof: copied from the verified token, never upgraded.
    return { ...this.details(updated), accessToken: this.tokens.issueAccessToken(updated, claims.amr.includes('mfa')) };
  }
  // D7: changePassword ends every session of this user, the current one included.
  @Post('password')
  @HttpCode(200)
  async changePassword(@CurrentUser() claims: AccessTokenClaims, @Body() body: PasswordChangeDto) {
    const user = await this.user(claims);
    if (!await bcrypt.compare(body.currentPassword, user.passwordHash))
      throw new BadRequestException('Your current password is incorrect.');
    assertBcryptLength(body.newPassword);
    if (body.currentPassword === body.newPassword)
      throw new BadRequestException('Choose a different new password.');
    const hash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
    if (!await this.users.changePassword(user.id, user.passwordHash, hash))
      throw new BadRequestException('Your password changed during this request. Please log in again.');
    return { changed: true };
  }
}
