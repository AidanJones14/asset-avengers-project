import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import bcrypt from 'bcrypt';
import { UsersRepository } from '../users/users.repository.js';
import type { User } from '../users/users.repository.js';
import { TokenService } from './token.service.js';
import { BCRYPT_COST } from './auth.service.js';

export class ProfileNameDto {
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
}
export class PasswordChangeDto {
  @IsString() @IsNotEmpty() @MaxLength(72) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(72) newPassword!: string;
}

@Controller('auth/profile')
@UseGuards(ThrottlerGuard)
export class ProfileController {
  constructor(private readonly users: UsersRepository, private readonly tokens: TokenService) {}
  private async user(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Please log in again.');
    let id: string;
    try {
      const claims = this.tokens.validateAccessToken(authorization.slice(7));
      // Profile updates reissue access tokens, so require the same MFA proof as Spring.
      const staff = claims.roles?.some(role => role === 'ADMIN' || role === 'ANALYST');
      if (!Array.isArray(claims.amr) || !claims.amr.includes('pwd') ||
          (!claims.amr.includes('mfa') && (claims.mfa_required !== false || staff)))
        throw new UnauthorizedException('Authenticator verification is required.');
      id = claims.sub;
    }
    catch { throw new UnauthorizedException('Please log in again.'); }
    const user = await this.users.findById(id);
    if (!user) throw new UnauthorizedException('Please log in again.');
    return user;
  }
  private details(user: User) {
    return { email: user.email, firstName: user.firstName || '', lastName: user.lastName || '', roles: user.roles };
  }
  @Get()
  async get(@Headers('authorization') authorization?: string) {
    return this.details(await this.user(authorization));
  }
  @Patch()
  async update(@Headers('authorization') authorization: string | undefined, @Body() body: ProfileNameDto) {
    const user = await this.user(authorization);
    const updated = await this.users.updateName(user.id, body.firstName, body.lastName);
    if (!updated) throw new UnauthorizedException('Please log in again.');
    return { ...this.details(updated), accessToken: this.tokens.issueAccessToken(updated, this.tokens.validateAccessToken(authorization!.slice(7)).amr.includes('mfa')) };
  }
  @Post('password')
  @HttpCode(200)
  async changePassword(@Headers('authorization') authorization: string | undefined, @Body() body: PasswordChangeDto) {
    const user = await this.user(authorization);
    if (!await bcrypt.compare(body.currentPassword, user.passwordHash))
      throw new BadRequestException('Your current password is incorrect.');
    if (Buffer.byteLength(body.newPassword, 'utf8') > 72)
      throw new BadRequestException('New password must be at most 72 UTF-8 bytes.');
    if (body.currentPassword === body.newPassword)
      throw new BadRequestException('Choose a different new password.');
    const hash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
    if (!await this.users.changePassword(user.id, user.passwordHash, hash))
      throw new BadRequestException('Your password changed during this request. Please log in again.');
    return { changed: true };
  }
}
