import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { TEST_ENV } from '../../test/test-env.js';
import type { Env } from '../config/env.js';
import type { User, UsersRepository } from '../users/users.repository.js';
import { MfaService } from './mfa.service.js';
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

  async create(email: string, passwordHash: string, firstName: string, lastName: string): Promise<User | null> {
    if (this.users.has(email)) return null;
    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash,
      firstName,
      lastName,
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
      mfaVerifiedAt: new Date(),
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // <Env, true> matches what AuthService and TokenService ask for in their constructors.
    const config = new ConfigService<Env, true>({
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
      {
        enabled: async () => true,
        start: async (user: User) => ({mfaRequired:true,challengeToken:user.id,purpose:'login'}),
        complete: async (id: string,_code: string,_purpose: string,onLogin: (id:string)=>Promise<unknown>) => ({tokens:await onLogin(id)}),
      } as unknown as MfaService,
    );
  });

  // This fake simulates completed second-factor proof; PostgreSQL tests exercise real TOTP.
  async function passwordLogin(email: string, password: string) {
    const result = await service.login(email, password);
    if (!('mfaRequired' in result)) throw new Error('Expected an MFA challenge');
    expect(result).not.toHaveProperty('accessToken');
    return await service.finishMfa(result.challengeToken,'123456','login') as {accessToken:string;refreshToken:string};
  }

  const email = 'dave@example.com';
  const password = 'a-long-enough-password';

  it('register returns the new user and stores a bcrypt hash, never the password', async () => {
    const result = await service.register(email, password, 'Cameron', 'Kelly');

    expect(result).toEqual({ id: expect.any(String), email, registered: true });
    const profile = await users.findByEmail(email);
    expect(profile?.firstName).toBe('Cameron');
    expect(profile?.lastName).toBe('Kelly');

    const stored = await users.findByEmail(email);
    expect(stored!.id).toBe(result.id);
    expect(stored!.passwordHash).not.toBe(password);
    expect(stored!.passwordHash.startsWith('$2b$10$')).toBe(true); // bcrypt, cost 10
    expect(await bcrypt.compare(password, stored!.passwordHash)).toBe(true);
  });

  it('the same password hashes differently for two users (random salt)', async () => {
    await service.register('erin@example.com', password, 'Cameron', 'Kelly');
    await service.register('frank@example.com', password, 'Cameron', 'Kelly');

    const erin = await users.findByEmail('erin@example.com');
    const frank = await users.findByEmail('frank@example.com');
    expect(erin!.passwordHash).not.toBe(frank!.passwordHash);
  });

  it('register rejects an email that is already registered', async () => {
    await service.register(email, password, 'Cameron', 'Kelly');

    await expect(
      service.register(email, 'another-long-password', 'Cameron', 'Kelly'),
    ).rejects.toThrow(ConflictException);
  });

  // Lecture 14, "Writing the Login Happy Path Test" onwards.
  it('logs in and receives valid tokens', async () => {
    await service.register('carol@example.com', 'mission123-long', 'Cameron', 'Kelly');

    const result = await passwordLogin('carol@example.com', 'mission123-long');

    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.accessToken).not.toBe(result.refreshToken);
  });

  it('issues a token that validates and carries the right claims', async () => {
    const { id } = await service.register(email, password, 'Cameron', 'Kelly');
    const { accessToken } = await passwordLogin(email, password);

    const claims = tokens.validateAccessToken(accessToken);

    expect(claims.sub).toBe(id); // the user UUID, never the email
    expect(claims.email).toBe(email);
    expect(claims.name).toBe('Cameron Kelly');
    expect(claims.roles).toEqual(['CLIENT']);
    expect(claims.iss).toBe(TEST_ENV.JWT_ISSUER);
    expect(claims.aud).toEqual([TEST_ENV.JWT_AUDIENCE, TEST_ENV.AUTH_JWT_AUDIENCE]); // a client: no staff audience
  });

  it('rejects an incorrect password', async () => {
    await service.register(email, password, 'Cameron', 'Kelly');

    await expect(passwordLogin(email, 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // The message must not reveal whether the email exists.
  it('gives an unknown email the same error as a wrong password', async () => {
    await service.register(email, password, 'Cameron', 'Kelly');

    await expect(passwordLogin('nobody@example.com', password)).rejects.toThrow(
      'invalid email or password',
    );
    await expect(passwordLogin(email, 'wrong-password')).rejects.toThrow(
      'invalid email or password',
    );
  });

  // Beyond the lecture: the session behaviour this service adds.
  it('refresh returns a new pair, and the old refresh token stops working', async () => {
    await service.register(email, password, 'Cameron', 'Kelly');
    const first = await passwordLogin(email, password);

    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.validateAccessToken(second.accessToken).email).toBe(email);
    await expect(service.refresh(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('reusing a refresh token revokes the session (the newest token stops working too)', async () => {
    await service.register(email, password, 'Cameron', 'Kelly');
    const { refreshToken: r1 } = await passwordLogin(email, password);
    const { refreshToken: r2 } = await service.refresh(r1);

    await expect(service.refresh(r1)).rejects.toThrow(UnauthorizedException); // replay
    await expect(service.refresh(r2)).rejects.toThrow(UnauthorizedException); // session revoked
  });

  it('logout makes the refresh token stop working', async () => {
    await service.register(email, password, 'Cameron', 'Kelly');
    const { refreshToken } = await passwordLogin(email, password);

    await expect(service.logout(refreshToken)).resolves.toEqual({
      loggedOut: true,
    });
    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // Fakes only Date, so the service's `new Date()` and Date.now() see the moved clock.
  it('a session ends after 30 minutes without a refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await service.register(email, password, 'Cameron', 'Kelly');
    const { refreshToken } = await passwordLogin(email, password);

    vi.setSystemTime(Date.now() + 31 * 60_000);

    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

// Staff-security plan 3.1: who has to use an authenticator, decided at login.
// The suite above fakes an account that already HAS an authenticator (enabled → true), so every
// login there ends in an MFA challenge and the role never matters. Here nobody has enrolled yet
// (enabled → false), which is exactly when the role decides: login either hands out tokens after
// the password alone, or demands authenticator enrollment first.
describe('AuthService: MFA policy for accounts with no authenticator yet', () => {
  let service: AuthService;
  let tokens: TokenService;
  let users: FakeUsersRepository;
  const password = 'a-long-enough-password';

  beforeEach(() => {
    const config = new ConfigService<Env, true>({
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
      {
        // 1. No authenticator enrolled for anyone.
        enabled: async () => false,
        // 2. Echo back which challenge login asked for ('enroll' when MFA is required but missing).
        start: async (user: User, purpose: string) => ({ mfaRequired: true, challengeToken: user.id, purpose }),
      } as unknown as MfaService,
    );
  });

  // Registers a CLIENT through the real service, then changes its role in the fake store.
  // (Registration only ever creates CLIENTs; staff accounts come from seed data today.)
  async function accountWithRole(role: string) {
    const email = `${role.toLowerCase()}@example.com`;
    await service.register(email, password, 'Test', 'Person');
    (await users.findByEmail(email))!.roles = [role];
    return email;
  }

  // 3. Control: the one password-only case the policy allows.
  it('a CLIENT who did not opt in gets tokens from the password alone', async () => {
    const email = await accountWithRole('CLIENT');
    const result = await service.login(email, password);
    if (!('accessToken' in result)) throw new Error('Expected tokens, got an MFA challenge');
    expect(tokens.validateAccessToken(result.accessToken)).toMatchObject({ amr: ['pwd'], mfa_required: false });
  });

  // 4. Every staff role must enroll an authenticator before it gets any token.
  //    SUPER_ADMIN is the role dev missed (auth.service.ts requiresMfa only named ADMIN and ANALYST).
  it.each(['ANALYST', 'ADMIN', 'SUPER_ADMIN'])(
    'a %s must enroll an authenticator before any session',
    async (role) => {
      const email = await accountWithRole(role);
      const result = await service.login(email, password);
      expect(result).toMatchObject({ mfaRequired: true, purpose: 'enroll' });
      expect(result).not.toHaveProperty('accessToken');
    },
  );
});
