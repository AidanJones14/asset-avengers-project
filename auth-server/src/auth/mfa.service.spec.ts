import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { generate } from 'otplib';
import { MfaService } from './mfa.service.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { SessionsRepository } from './sessions.repository.js';
import { TEST_ENV } from '../../test/test-env.js';
import type { Env } from '../config/env.js';
const config = () =>
  new ConfigService<Env, true>({
    ...TEST_ENV,
    ACCESS_TOKEN_TTL: '15m',
    SESSION_IDLE_TIMEOUT_MINUTES: 30,
    SESSION_MAX_AGE_HOURS: 12,
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  });
describe('MFA encryption', () => {
  it('uses fresh IVs and rejects tampering or another owner', () => {
    const service = new MfaService({} as pg.Pool, config());
    const id = randomUUID();
    const first = service.encrypt('private-secret', id);
    expect(service.encrypt('private-secret', id)).not.toBe(first);
    expect(service.decrypt(first, id)).toBe('private-secret');
    expect(() => service.decrypt(first, randomUUID())).toThrow();
    const altered = Buffer.from(first, 'base64');
    altered[30] ^= 1;
    expect(() => service.decrypt(altered.toString('base64'), id)).toThrow();
  });
  it('fails closed without its external encryption key', () => {
    expect(() =>
      new MfaService({} as pg.Pool, new ConfigService({})).encrypt(
        'secret',
        randomUUID(),
      ),
    ).toThrow('MFA encryption key');
  });
});
// Explicit isolated DB only: never use application database environment settings.
describe.skipIf(!process.env.MFA_TEST_DATABASE_URL)(
  'Mandatory MFA PostgreSQL state machine',
  () => {
    let db: pg.Pool;
    let mfa: MfaService;
    let auth: AuthService;
    let users: UsersRepository;
    let tokens: TokenService;
    const password = 'mfa-integration-password';
    beforeAll(async () => {
      db = new pg.Pool({ connectionString: process.env.MFA_TEST_DATABASE_URL });
      await db.query(await readFile('../DB/auth_db.schema.sql', 'utf8'));
      const settings = config();
      mfa = new MfaService(db, settings);
      users = new UsersRepository(db);
      tokens = new TokenService(settings);
      auth = new AuthService(
        users,
        new SessionsRepository(db),
        tokens,
        settings,
        mfa,
      );
    });
    afterAll(async () => {
      await db?.end();
    });
    async function enroll() {
      const email = `${randomUUID()}@mfa.test`;
      const user = await auth.register(email, password, 'MFA', 'Test', true);
      const setup = await auth.login(email, password);
      if (!('mfaRequired' in setup)) throw new Error('Expected an MFA challenge');
      expect(setup).not.toHaveProperty('accessToken');
      expect(setup).toMatchObject({
        purpose: 'enroll',
        enrollmentRequired: true,
      });
      expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      const code = await generate({ secret: setup.secret! });
      const result = await auth.finishMfa(setup.challengeToken, code, 'enroll');
      if ('mfaRequired' in result) throw new Error('Unexpected challenge');
      expect(result.recoveryCodes).toHaveLength(10);
      expect(tokens.validateAccessToken(result.accessToken)).toHaveProperty(
        'amr',
        ['pwd', 'mfa'],
      );
      expect(await mfa.enabled(user.id)).toBe(true);
      return {
        email,
        user,
        setup,
        code,
        recoveryCodes: result.recoveryCodes!,
        pair: result,
      };
    }
    async function challenge(email: string) {
      const result = await auth.login(email, password);
      if (!('mfaRequired' in result)) throw new Error('Expected an MFA challenge');
      expect(result).not.toHaveProperty('accessToken');
      expect(result.purpose).toBe('login');
      return result.challengeToken;
    }
    it('allows clients to skip MFA and refresh without claiming second-factor proof', async () => {
      const email = `${randomUUID()}@optional.test`;
      const user = await auth.register(email, password, 'Optional', 'Client', false);
      const pair = await auth.login(email, password);
      if (!('accessToken' in pair)) throw new Error('Unexpected MFA challenge');
      expect(tokens.validateAccessToken(pair.accessToken)).toMatchObject({ amr: ['pwd'], mfa_required: false });
      expect((await db.query('SELECT mfa_verified_at FROM sessions WHERE user_id=$1', [user.id])).rows[0].mfa_verified_at).toBeNull();
      // Reapplying the schema must not revoke legitimate optional-MFA sessions.
      await db.query(await readFile('../DB/auth_db.schema.sql', 'utf8'));
      const refreshed = await auth.refresh(pair.refreshToken);
      expect(tokens.validateAccessToken(refreshed.accessToken)).toMatchObject({ amr: ['pwd'], mfa_required: false });
      await auth.logout(refreshed.refreshToken);
      expect(await auth.login(email, password)).toHaveProperty('accessToken');
    });
    it('keeps staff MFA mandatory even without a client signup opt-in', async () => {
      const email = `${randomUUID()}@staff.test`;
      const user = await auth.register(email, password, 'Staff', 'User', false);
      await db.query("UPDATE users SET roles='{ANALYST}' WHERE id=$1", [user.id]);
      expect(await auth.login(email, password)).toMatchObject({ purpose: 'enroll', enrollmentRequired: true });
    });

    // Staff-security plan 3.1: SUPER_ADMIN must be held to the same MFA rule as every other
    // non-client account, at each of the four places that decide it against the real database.
    // The account is registered as a CLIENT (registration never creates staff) and then
    // promoted with SQL, which is how seeded staff accounts look.
    async function passwordOnlySuperAdmin() {
      const email = `${randomUUID()}@super-admin.test`;
      const user = await auth.register(email, password, 'Super', 'Admin', false);
      await db.query("UPDATE users SET roles='{SUPER_ADMIN}' WHERE id=$1", [user.id]);
      return { email, user };
    }
    // Inserts a session that never proved a second factor (mfa_verified_at stays NULL), the way
    // dev's code could create one for a SUPER_ADMIN, plus its refresh token. Written with SQL so
    // the test does not depend on the code under test being able to create it.
    async function legacyPasswordOnlySession(userId: string) {
      const session = (await db.query(
        `INSERT INTO sessions (user_id, idle_expires_at, absolute_expires_at)
         VALUES ($1, now() + interval '30 minutes', now() + interval '12 hours') RETURNING id`,
        [userId],
      )).rows[0];
      const refreshToken = tokens.newRefreshToken();
      await db.query('INSERT INTO refresh_tokens (token_hash, session_id) VALUES ($1, $2)',
        [tokens.hashRefreshToken(refreshToken), session.id]);
      return { sessionId: session.id as string, refreshToken };
    }
    // 1. AuthService.login: the password alone must lead to authenticator enrollment, not tokens.
    it('keeps SUPER_ADMIN MFA mandatory at login', async () => {
      const { email } = await passwordOnlySuperAdmin();
      expect(await auth.login(email, password)).toMatchObject({ purpose: 'enroll', enrollmentRequired: true });
    });
    // 2. SessionsRepository.create, the choke point every login path ends in: it re-reads the
    //    roles under a row lock and must refuse a session without MFA proof.
    it('refuses to create a password-only SUPER_ADMIN session', async () => {
      const { user } = await passwordOnlySuperAdmin();
      await expect(new SessionsRepository(db).create(user.id, Buffer.alloc(32, 4),
        new Date(Date.now()+60000), new Date(Date.now()+120000), undefined, false)).rejects.toThrow('MFA verification is required');
    });
    // 3. AuthService.refresh: a password-only session that already exists cannot be turned
    //    into fresh tokens.
    it('refuses to refresh a password-only SUPER_ADMIN session', async () => {
      const { user } = await passwordOnlySuperAdmin();
      const { refreshToken } = await legacyPasswordOnlySession(user.id);
      await expect(auth.refresh(refreshToken)).rejects.toThrow('Authenticator verification is required');
    });
    // 4. DB/auth_db.schema.sql: re-running the migration revokes password-only sessions of every
    //    account that needs MFA. (The optional-client test above proves CLIENT sessions survive it.)
    it('revokes a password-only SUPER_ADMIN session when the schema is re-applied', async () => {
      const { user } = await passwordOnlySuperAdmin();
      const { sessionId } = await legacyPasswordOnlySession(user.id);
      await db.query(await readFile('../DB/auth_db.schema.sql', 'utf8'));
      const revoked = (await db.query('SELECT revoked_at FROM sessions WHERE id=$1', [sessionId])).rows[0].revoked_at;
      expect(revoked).not.toBeNull();
    });
    it('does not allow password-only session creation once an authenticator is enabled', async () => {
      const item = await enroll();
      await expect(new SessionsRepository(db).create(item.user.id, Buffer.alloc(32, 3),
        new Date(Date.now()+60000), new Date(Date.now()+120000), undefined, false)).rejects.toThrow('MFA verification is required');
    });
    it('requires enrollment before any session and prevents OTP replay after enrollment', async () => {
      const item = await enroll();
      const token = await challenge(item.email);
      await expect(auth.finishMfa(token, item.code, 'login')).rejects.toThrow();
      await db.query(
        'UPDATE user_mfa SET last_time_step=last_time_step-1 WHERE user_id=$1',
        [item.user.id],
      );
      const result = await auth.finishMfa(token, item.code, 'login');
      expect(result).toHaveProperty('accessToken');
      await expect(auth.finishMfa(token, item.code, 'login')).rejects.toThrow();
    });
    it('consumes a recovery code/challenge once under concurrent verification', async () => {
      const item = await enroll();
      const token = await challenge(item.email);
      const results = await Promise.allSettled([
        auth.finishMfa(token, item.recoveryCodes[0], 'login'),
        auth.finishMfa(token, item.recoveryCodes[0], 'login'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await expect(
        auth.finishMfa(
          await challenge(item.email),
          item.recoveryCodes[0],
          'login',
        ),
      ).rejects.toThrow();
    });
    it('persists bad attempts across new challenges and rejects expiry/wrong purpose', async () => {
      const item = await enroll();
      let token = await challenge(item.email);
      await expect(
        auth.finishMfa(token, item.recoveryCodes[0], 'replace'),
      ).rejects.toThrow();
      for (let i = 0; i < 5; i++)
        await expect(
          auth.finishMfa(token, 'ffffffffffffffff', 'login'),
        ).rejects.toThrow();
      await expect(auth.login(item.email, password)).rejects.toThrow(
        'Too many MFA attempts',
      );
      await db.query(
        "UPDATE user_mfa SET locked_until=now()-interval '1 minute' WHERE user_id=$1",
        [item.user.id],
      );
      token = await challenge(item.email);
      for (let i = 0; i < 5; i++)
        await expect(
          auth.finishMfa(token, 'ffffffffffffffff', 'login'),
        ).rejects.toThrow();
      expect(
        (
          await db.query('SELECT failures FROM user_mfa WHERE user_id=$1', [
            item.user.id,
          ])
        ).rows[0].failures,
      ).toBe(5);
      await db.query(
        'UPDATE user_mfa SET failures=0,locked_until=NULL WHERE user_id=$1',
        [item.user.id],
      );
      token = await challenge(item.email);
      await db.query(
        "UPDATE mfa_challenges SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [item.user.id],
      );
      await expect(
        auth.finishMfa(token, item.recoveryCodes[1], 'login'),
      ).rejects.toThrow();
    });
    it('requires old proof then new proof for replacement and revokes old sessions/codes', async () => {
      const item = await enroll();
      await expect(
        auth.startMfa(item.email, 'wrong', 'replace'),
      ).rejects.toThrow();
      const first = await auth.startMfa(item.email, password, 'replace');
      const next = await auth.finishMfa(
        first.challengeToken,
        item.recoveryCodes[0],
        'replace',
      );
      if (!('mfaRequired' in next)) throw new Error('Replacement QR missing');
      expect(await mfa.enabled(item.user.id)).toBe(true);
      const result = await auth.finishMfa(
        next.challengeToken,
        await generate({ secret: next.secret! }),
        'replace-enroll',
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('recoveryCodes');
      await expect(auth.refresh(item.pair.refreshToken)).rejects.toThrow();
      await expect(
        auth.finishMfa(
          await challenge(item.email),
          item.recoveryCodes[1],
          'login',
        ),
      ).rejects.toThrow();
    });
    it('rolls back consumed recovery proof when session creation fails', async () => {
      const item = await enroll();
      const token = await challenge(item.email);
      await expect(
        mfa.complete(token, item.recoveryCodes[0], 'login', async () => {
          throw new Error('session unavailable');
        }),
      ).rejects.toThrow('session unavailable');
      expect(
        await auth.finishMfa(token, item.recoveryCodes[0], 'login'),
      ).toHaveProperty('accessToken');
    });
    it('requires proof on session creation and rejects historical refresh sessions', async () => {
      const item = await enroll();
      const sessions = new SessionsRepository(db);
      await expect(
        sessions.create(
          item.user.id,
          randomBytes(32),
          new Date(Date.now() + 60000),
          new Date(Date.now() + 120000),
        ),
      ).rejects.toThrow('MFA verification is required');
      await db.query(
        'UPDATE sessions SET mfa_verified_at=NULL WHERE user_id=$1',
        [item.user.id],
      );
      await expect(auth.refresh(item.pair.refreshToken)).rejects.toThrow();
    });
    it('requires another second factor after explicit logout', async () => {
      const item = await enroll();
      await auth.logout(item.pair.refreshToken);
      await expect(auth.refresh(item.pair.refreshToken)).rejects.toThrow();
      expect(await auth.login(item.email, password)).toMatchObject({
        purpose: 'login',
        mfaRequired: true,
      });
    });
  },
);
