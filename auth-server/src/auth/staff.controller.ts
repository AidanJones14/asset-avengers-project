// Staff account routes (staff-security plan 4.11). Order per request: the global JwtAuthGuard
// (valid token with MFA proof), ThrottlerGuard, then @Roles' RolesGuard (who may call the route),
// then StaffService (which account they may act on).
import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrorDto } from './dto/responses.dto.js';
import { CreateStaffDto, CreatedStaffDto, StaffAccountDto } from './dto/staff.dto.js';
import { CurrentUser, Roles } from './guards/auth-decorators.js';
import { StaffService } from './staff.service.js';
import type { AccessTokenClaims } from './token.service.js';

@ApiTags('staff accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'No valid access token (or it lacks MFA proof)' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Your role may not do this' })
@UseGuards(ThrottlerGuard)
@Controller('auth/admin/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  // D2: only a super admin creates admins. No route creates a super admin.
  @Post('admins')
  @Roles('SUPER_ADMIN')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create an ADMIN with a one-time temporary password' })
  @ApiCreatedResponse({ type: CreatedStaffDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Email is already registered' })
  createAdmin(@CurrentUser() caller: AccessTokenClaims, @Body() body: CreateStaffDto) {
    return this.staff.create(caller, 'ADMIN', body.email, body.firstName, body.lastName);
  }

  @Post('analysts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create an ANALYST with a one-time temporary password' })
  @ApiCreatedResponse({ type: CreatedStaffDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Email is already registered' })
  createAnalyst(@CurrentUser() caller: AccessTokenClaims, @Body() body: CreateStaffDto) {
    return this.staff.create(caller, 'ANALYST', body.email, body.firstName, body.lastName);
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List staff accounts' })
  @ApiOkResponse({ type: [StaffAccountDto] })
  list(@CurrentUser() caller: AccessTokenClaims) {
    return this.staff.list(caller);
  }

  // D4: admins manage analysts; a super admin manages admins and analysts. Nobody changes
  // themselves or a super admin. Disabling signs the account out everywhere.
  @Post(':id/disable')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Disable a staff account and end its sessions' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'No staff account with this id' })
  disable(@CurrentUser() caller: AccessTokenClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.setDisabled(caller, id, true);
  }

  @Post(':id/enable')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Re-enable a disabled staff account' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'No staff account with this id' })
  enable(@CurrentUser() caller: AccessTokenClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.setDisabled(caller, id, false);
  }
}
