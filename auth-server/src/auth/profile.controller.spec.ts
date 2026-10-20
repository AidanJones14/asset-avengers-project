import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ProfileController, PasswordChangeDto } from './profile.controller.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { TokenService } from './token.service.js';

describe('Profile and password ownership', () => {
  let hash: string;
  beforeAll(async () => { hash = await bcrypt.hash('ExistingPassword123!', 10); });
  function setup() {
    const user = { id: 'signed-in-user', email: 'client@example.com', firstName: 'Sam', lastName: 'Client', roles: ['CLIENT'], passwordHash: hash };
    const users = { findById: vi.fn().mockResolvedValue(user), updateName: vi.fn(), changePassword: vi.fn().mockResolvedValue(true) };
    const tokens = { validateAccessToken: vi.fn().mockReturnValue({ sub: user.id, amr: ['pwd', 'mfa'], mfa_required: true, roles: ['CLIENT'] }), issueAccessToken: vi.fn().mockReturnValue('updated-token') };
    return { users, tokens, user, controller: new ProfileController(users as unknown as UsersRepository, tokens as unknown as TokenService) };
  }
  it('requires a valid access token and never returns a password hash', async () => {
    const { controller, tokens } = setup();
    await expect(controller.get()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await controller.get('Bearer valid')).toEqual({ email: 'client@example.com', firstName: 'Sam', lastName: 'Client', roles: ['CLIENT'] });
    tokens.validateAccessToken.mockImplementation(() => { throw Error('invalid'); });
    await expect(controller.get('Bearer invalid')).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects password-only tokens before reissuing profile claims', async () => {
    const { controller, tokens, users } = setup();
    tokens.validateAccessToken.mockReturnValue({ sub: 'signed-in-user', amr: ['pwd'], mfa_required: true, roles: ['CLIENT'] });
    await expect(controller.update('Bearer old-token', { firstName: 'Updated', lastName: 'Client' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.updateName).not.toHaveBeenCalled();
    expect(tokens.issueAccessToken).not.toHaveBeenCalled();
  });
  it('preserves password-only proof for an optional-MFA client profile update', async () => {
    const { controller, tokens, users, user } = setup();
    tokens.validateAccessToken.mockReturnValue({ sub: user.id, amr: ['pwd'], mfa_required: false, roles: ['CLIENT'] });
    users.updateName.mockResolvedValue(user);
    await controller.update('Bearer optional-token', { firstName: 'Sam', lastName: 'Client' });
    expect(tokens.issueAccessToken).toHaveBeenCalledWith(user, false);
  });
  it('updates only the authenticated name and refreshes display claims', async () => {
    const { controller, users, user } = setup();
    users.updateName.mockResolvedValue({ ...user, firstName: 'Updated' });
    const response = await controller.update('Bearer valid', { firstName: 'Updated', lastName: 'Client' });
    expect(users.updateName).toHaveBeenCalledWith(user.id, 'Updated', 'Client');
    expect(response.accessToken).toBe('updated-token');
    expect(response).not.toHaveProperty('passwordHash');
  });
  it('requires the current password and never writes a plaintext password', async () => {
    const { controller, users, user } = setup();
    await expect(controller.changePassword('Bearer valid', {currentPassword: 'wrong', newPassword: 'ReplacementPassword123!'})).rejects.toBeInstanceOf(BadRequestException);
    expect(users.changePassword).not.toHaveBeenCalled();
    await expect(controller.changePassword('Bearer valid', {currentPassword: 'ExistingPassword123!', newPassword: 'ReplacementPassword123!'})).resolves.toEqual({ changed: true });
    const args = users.changePassword.mock.calls[0];
    expect(args[0]).toBe(user.id); expect(args[1]).toBe(hash);
    expect(await bcrypt.compare('ReplacementPassword123!', args[2])).toBe(true);
  });
  it('rejects reuse and bcrypt-truncated passwords', async () => {
    const { controller, users } = setup();
    await expect(controller.changePassword('Bearer valid', {currentPassword: 'ExistingPassword123!', newPassword: 'ExistingPassword123!'})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.changePassword('Bearer valid', {currentPassword: 'ExistingPassword123!', newPassword: '界'.repeat(30)})).rejects.toBeInstanceOf(BadRequestException);
    expect(users.changePassword).not.toHaveBeenCalled();
    const dto = Object.assign(new PasswordChangeDto(), { currentPassword: '', newPassword: 'short' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
