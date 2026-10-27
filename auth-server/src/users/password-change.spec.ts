import 'reflect-metadata';
import { UsersRepository } from './users.repository.js';
import type pg from 'pg';

describe('Password update transaction', () => {
  it('atomically changes the hash and revokes refresh sessions', async () => {
    const query = vi.fn().mockResolvedValue({rowCount: 1});
    const release = vi.fn();
    const repository = new UsersRepository({connect: async () => ({query,release})} as unknown as pg.Pool);
    expect(await repository.changePassword('user', 'old-hash', 'new-hash')).toBe(true);
    expect(query.mock.calls.map(args => args[0])).toEqual(['BEGIN', 'UPDATE users SET password_hash = $3 WHERE id = $1 AND password_hash = $2', 'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', 'COMMIT']);
    expect(query.mock.calls[1][1]).toEqual(['user', 'old-hash', 'new-hash']);
    expect(release).toHaveBeenCalledOnce();
  });
  it('does not revoke sessions if the password changed concurrently', async () => {
    const query = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({rowCount: 0}).mockResolvedValueOnce({});
    const release = vi.fn();
    const repository = new UsersRepository({connect: async () => ({query,release})} as unknown as pg.Pool);
    expect(await repository.changePassword('user','old','next')).toBe(false);
    expect(query.mock.calls.map(args => args[0])).toEqual(['BEGIN', 'UPDATE users SET password_hash = $3 WHERE id = $1 AND password_hash = $2', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });
});
