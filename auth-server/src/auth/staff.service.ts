// Staff account management (staff-security plan D2, D3, D4). The controller's @Roles decides who
// may call each route; this service decides WHICH accounts they may act on, like the trading
// backend's owner-scoped services.
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { UsersRepository, type User } from '../users/users.repository.js';
import { logAuthEvent } from '../common/log-auth-event.js';
import { isStaff, type StaffRole } from './access-policy.js';
import { BCRYPT_COST } from './auth.service.js';
import type { AccessTokenClaims } from './token.service.js';

export interface CreatedStaff {
  id: string;
  email: string;
  role: StaffRole;
  temporaryPassword: string;
}

@Injectable()
export class StaffService {
  constructor(private readonly users: UsersRepository) {}

  // D2/D3: create an ADMIN or ANALYST. The role comes from the route; the body only names the person.
  async create(caller: AccessTokenClaims, role: 'ADMIN' | 'ANALYST', email: string, firstName: string, lastName: string): Promise<CreatedStaff> {
    const actor = await this.currentActor(caller);
    // 1. 24 random characters (144 bits); shown once to the creating admin, never stored in clear.
    const temporaryPassword = randomBytes(18).toString('base64url');
    // 2. The new account must replace it at first login, then enroll MFA (users.repository.ts createStaff).
    const user = await this.users.createStaff(email, firstName, lastName, role, await bcrypt.hash(temporaryPassword, BCRYPT_COST));
    if (!user) throw new ConflictException('email is already registered');
    logAuthEvent('staff_created', actor.id, user.id);
    return { id: user.id, email: user.email, role, temporaryPassword };
  }

  async list(caller: AccessTokenClaims) {
    await this.currentActor(caller);
    return this.users.listStaff();
  }

  // D4: disable or enable a staff account. Never deletes it (its id is referenced by audit records).
  async setDisabled(caller: AccessTokenClaims, targetId: string, disabled: boolean) {
    const actor = await this.currentActor(caller);
    const target = await this.users.findById(targetId);
    // 1. Only staff accounts are managed here; a client id looks the same as a missing one.
    if (!target || !isStaff(target.roles)) throw new NotFoundException('Staff account not found');
    // 2. Nobody changes their own account (no locking yourself out, no re-enabling yourself).
    if (target.id === actor.id) throw new ForbiddenException('You cannot disable or enable your own account.');
    // 3. A super admin can't be disabled through the API.
    if (target.roles.includes('SUPER_ADMIN')) throw new ForbiddenException('A super admin account cannot be changed here.');
    // 4. An admin manages analysts only; a super admin manages admins and analysts.
    if (!actor.roles.includes('SUPER_ADMIN') && !target.roles.includes('ANALYST'))
      throw new ForbiddenException('Admins can only manage analyst accounts.');
    const updated = await this.users.setDisabled(target.id, disabled);
    if (!updated) throw new NotFoundException('Staff account not found');
    logAuthEvent(disabled ? 'staff_disabled' : 'staff_enabled', actor.id, target.id);
    return { id: updated.id, email: updated.email, role: updated.roles[0], disabledAt: updated.disabledAt ?? null };
  }

  // The caller as the database sees them NOW. auth-server owns the DB, so unlike the Spring
  // services it can refuse a disabled admin whose access token hasn't expired yet (D6).
  private async currentActor(caller: AccessTokenClaims): Promise<User> {
    const actor = await this.users.findById(caller.sub);
    if (!actor || actor.disabledAt) throw new UnauthorizedException('Please log in again.');
    return actor;
  }
}
