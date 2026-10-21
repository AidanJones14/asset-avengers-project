import { Body, Controller, Header, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RefreshTokenDto } from './dto/requests.dto.js';
import { SupersetSsoService } from './superset-sso.service.js';
import { Public } from './guards/auth-decorators.js';

export class SupersetTicketDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) ticket!: string;
}
export class SupersetSessionDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) sessionToken!: string;
}
// No access token on these routes: ticket proves itself with the refresh token, the
// backchannel with the SSO secret. @Public() lets them past the global JwtAuthGuard.
@Public()
@Controller('auth/superset')
export class SupersetSsoController {
  constructor(private readonly sso: SupersetSsoService) {}
  @Post('ticket') @HttpCode(200) @Header('Cache-Control','no-store') @UseGuards(ThrottlerGuard)
  issue(@Body() body: RefreshTokenDto) { return this.sso.issue(body.refreshToken); }
  // Backchannel endpoints require a separate server-only secret. No browser CORS grant.
  @Post('exchange') @HttpCode(200) @Header('Cache-Control','no-store')
  exchange(@Headers('x-endgame-sso-secret') secret: string | undefined, @Body() body: SupersetTicketDto) {
    this.sso.authenticateClient(secret); return this.sso.exchange(body.ticket);
  }
  @Post('session') @HttpCode(200) @Header('Cache-Control','no-store')
  session(@Headers('x-endgame-sso-secret') secret: string | undefined, @Body() body: SupersetSessionDto) {
    this.sso.authenticateClient(secret); return this.sso.session(body.sessionToken);
  }
}
