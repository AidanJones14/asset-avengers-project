import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ProfileController, PasswordChangeDto } from './profile.controller.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { AccessTokenClaims, TokenService } from './token.service.js';

// Token checks (missing, forged, no MFA proof) now happen in the global JwtAuthGuard before these
// methods run; they are tested in test/app.e2e-spec.ts. Here the controller gets verified claims.
describe('Profile and password ownership', () => {
  let hash: string;
  beforeAll(async () => { hash = await bcrypt.hash('ExistingPassword123!', 10); });
  const claims = (overrides: Partial<AccessTokenClaims> = {}) =>
    ({ sub: 'signed-in-user', amr: ['pwd', 'mfa'], mfa_required: true, roles: ['CLIENT'], ...overrides }) as AccessTokenClaims;
  function setup() {
    const user = { id: 'signed-in-user', email: 'client@example.com', firstName: 'Sam', lastName: 'Client', roles: ['CLIENT'], passwordHash: hash, disabledAt: null as Date | null };
    const users = { findById: vi.fn().mockResolvedValue(user), updateName: vi.fn(), changePassword: vi.fn().mockResolvedValue(true) };
    const tokens = { issueAccessToken: vi.fn().mockReturnValue('updated-token') };
    return { users, tokens, user, controller: new ProfileController(users as unknown as UsersRepository, tokens as unknown as TokenService) };
  }
  it('returns the caller’s own profile and never a password hash', async () => {
    const { controller, users } = setup();
    expect(await controller.get(claims())).toEqual({ email: 'client@example.com', firstName: 'Sam', lastName: 'Client', roles: ['CLIENT'] });
    expect(users.findById).toHaveBeenCalledWith('signed-in-user');
  });
  it('refuses a deleted or disabled account even with a valid token', async () => {
    const { controller, users, user } = setup();
    users.findById.mockResolvedValueOnce(null);
    await expect(controller.get(claims())).rejects.toBeInstanceOf(UnauthorizedException);
    users.findById.mockResolvedValueOnce({ ...user, disabledAt: new Date() });
    await expect(controller.get(claims())).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('preserves password-only proof for an optional-MFA client profile update', async () => {
    const { controller, tokens, users, user } = setup();
    users.updateName.mockResolvedValue(user);
    await controller.update(claims({ amr: ['pwd'], mfa_required: false }), { firstName: 'Sam', lastName: 'Client' });
    expect(tokens.issueAccessToken).toHaveBeenCalledWith(user, false);
  });
  it('updates only the authenticated name and refreshes display claims', async () => {
    const { controller, users, user, tokens } = setup();
    users.updateName.mockResolvedValue({ ...user, firstName: 'Updated' });
    const response = await controller.update(claims(), { firstName: 'Updated', lastName: 'Client' });
    expect(users.updateName).toHaveBeenCalledWith(user.id, 'Updated', 'Client');
    expect(tokens.issueAccessToken).toHaveBeenCalledWith({ ...user, firstName: 'Updated' }, true);
    expect(response.accessToken).toBe('updated-token');
    expect(response).not.toHaveProperty('passwordHash');
  });
  it('requires the current password and never writes a plaintext password', async () => {
    const { controller, users, user } = setup();
    await expect(controller.changePassword(claims(), {currentPassword: 'wrong', newPassword: 'ReplacementPassword123!'})).rejects.toBeInstanceOf(BadRequestException);
    expect(users.changePassword).not.toHaveBeenCalled();
    await expect(controller.changePassword(claims(), {currentPassword: 'ExistingPassword123!', newPassword: 'ReplacementPassword123!'})).resolves.toEqual({ changed: true });
    const args = users.changePassword.mock.calls[0];
    expect(args[0]).toBe(user.id); expect(args[1]).toBe(hash);
    expect(await bcrypt.compare('ReplacementPassword123!', args[2])).toBe(true);
  });
  it('rejects reuse and bcrypt-truncated passwords', async () => {
    const { controller, users } = setup();
    await expect(controller.changePassword(claims(), {currentPassword: 'ExistingPassword123!', newPassword: 'ExistingPassword123!'})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.changePassword(claims(), {currentPassword: 'ExistingPassword123!', newPassword: '界'.repeat(30)})).rejects.toBeInstanceOf(BadRequestException);
    expect(users.changePassword).not.toHaveBeenCalled();
    const dto = Object.assign(new PasswordChangeDto(), { currentPassword: '', newPassword: 'short' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
