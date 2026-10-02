import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { TEST_ENV } from '../../test/test-env.js';
import type { User, UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import type {
  RefreshTokenRecord,
  Session,
  SessionsRepository,
} from './sessions.repository.js';
import { TokenService } from './token.service.js';

// Unit tests for AuthService, no database. Lecture 14 used `new AuthService()`
// because its service had no dependencies. Ours needs repositories, so we pass
// in-memory fakes with the same methods.

class FakeUsersRepository {
  private readonly users = new Map<string, User>();

  async create(email: string, passwordHash: string): Promise<User | null> {
    if (this.users.has(email)) return null;
    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash,
      roles: ['CLIENT'],
    };
    this.users.set(email, user);
    return user;
  }
  async findByEmail(email: string) {
    return this.users.get(email) ?? null;
  }
  async findById(id: string) {
    return [...this.users.values()].find((u) => u.id === id) ?? null;
  }
}

class FakeSessionsRepository {
  readonly sessions = new Map<string, Session>();
  readonly tokens = new Map<
    string,
    { sessionId: string; usedAt: Date | null }
  >();

  async create(
    userId: string,
    tokenHash: Buffer,
    idleExpiresAt: Date,
    absoluteExpiresAt: Date,
  ) {
    const session = {
      id: crypto.randomUUID(),
      userId,
      idleExpiresAt,
      absoluteExpiresAt,
      revokedAt: null,
    };
    this.sessions.set(session.id, session);
    this.tokens.set(tokenHash.toString('hex'), {
      sessionId: session.id,
      usedAt: null,
    });
    return session;
  }
  async findByTokenHash(tokenHash: Buffer): Promise<RefreshTokenRecord | null> {
    const token = this.tokens.get(tokenHash.toString('hex'));
    return token
      ? { session: this.sessions.get(token.sessionId)!, usedAt: token.usedAt }
      : null;
  }
  async rotate(
    sessionId: string,
    oldHash: Buffer,
    newHash: Buffer,
    idleExpiresAt: Date,
  ) {
    const old = this.tokens.get(oldHash.toString('hex'));
    if (!old || old.usedAt) return false;
    old.usedAt = new Date();
    this.tokens.set(newHash.toString('hex'), { sessionId, usedAt: null });
    this.sessions.get(sessionId)!.idleExpiresAt = idleExpiresAt;
    return true;
  }
  async revoke(sessionId: string) {
    this.sessions.get(sessionId)!.revokedAt = new Date();
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let users: FakeUsersRepository; // kept so tests can read back what was stored

  // A fresh service and empty fakes for every test: no shared state between tests.
  beforeEach(() => {
    const config = new ConfigService({
      ...TEST_ENV,
      ACCESS_TOKEN_TTL: '15m',
      SESSION_IDLE_TIMEOUT_MINUTES: 30,
      SESSION_MAX_AGE_HOURS: 12,
    });
    tokens = new TokenService(config);
    users = new FakeUsersRepository();
    service = new AuthService(
      users as unknown as UsersRepository,
      new FakeSessionsRepository() as unknown as SessionsRepository,
      tokens,
      config,
    );
  });

  const email = 'dave@example.com';
  const password = 'a-long-enough-password';

  it('register returns the new user and stores a bcrypt hash, never the password', async () => {
    const result = await service.register(email, password);

    expect(result).toEqual({ id: expect.any(String), email, registered: true });

    const stored = await users.findByEmail(email);
    expect(stored!.id).toBe(result.id);
    expect(stored!.passwordHash).not.toBe(password);
    expect(stored!.passwordHash.startsWith('$2b$10$')).toBe(true); // bcrypt, cost 10
    expect(await bcrypt.compare(password, stored!.passwordHash)).toBe(true);
  });

  it('the same password hashes differently for two users (random salt)', async () => {
    await service.register('erin@example.com', password);
    await service.register('frank@example.com', password);

    const erin = await users.findByEmail('erin@example.com');
    const frank = await users.findByEmail('frank@example.com');
    expect(erin!.passwordHash).not.toBe(frank!.passwordHash);
  });

  it('register rejects an email that is already registered', async () => {
    await service.register(email, password);

    await expect(
      service.register(email, 'another-long-password'),
    ).rejects.toThrow(ConflictException);
  });

  // TODO(you): the three tests from lecture 14 ("Writing the Login Happy Path Test" onwards).
  // Turn each it.todo into it('...', async () => { ... }) once the matching
  // AuthService/TokenService methods are implemented.
  //
  // 1. register('carol@example.com', 'mission123-long'), then login with the same
  //    credentials; expect both tokens to be strings and not equal to each other.
  it.todo('logs in and receives valid tokens');

  // 2. register + login, then tokens.validateAccessToken(accessToken);
  //    expect claims.sub to be the user's id, claims.email and claims.roles to match.
  it.todo('issues a token that validates and carries the right claims');

  // 3. register, then expect login with a wrong password to reject:
  //    await expect(service.login(email, 'wrong-password')).rejects.toThrow(UnauthorizedException)
  it.todo('rejects an incorrect password');

  // Beyond the lecture: the session behaviour this service adds.
  it.todo(
    'refresh returns a new pair, and the old refresh token stops working',
  );
  it.todo(
    'reusing a refresh token revokes the session (the newest token stops working too)',
  );
  it.todo('logout makes the refresh token stop working');
});
