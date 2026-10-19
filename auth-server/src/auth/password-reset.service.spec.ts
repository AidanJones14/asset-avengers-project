import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generate } from 'otplib';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { PasswordResetService } from './password-reset.service.js';
import { EmailService } from './email.service.js';
import { MfaService } from './mfa.service.js';
import { AuthService } from './auth.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { SessionsRepository } from './sessions.repository.js';
import { TokenService } from './token.service.js';
import { TEST_ENV } from '../../test/test-env.js';
import type { Env } from '../config/env.js';

describe.skipIf(!process.env.MFA_TEST_DATABASE_URL)(
  'Password reset PostgreSQL flow',
  () => {
    let db: pg.Pool;
    let reset: PasswordResetService;
    let users: UsersRepository;
    let auth: AuthService;
    let mfa: MfaService;
    const sender = { sendPasswordReset: vi.fn() };
    const password = 'original-test-password';
    beforeAll(async () => {
      db = new pg.Pool({ connectionString: process.env.MFA_TEST_DATABASE_URL });
      await db.query(await readFile('../DB/auth_db.schema.sql', 'utf8'));
      const config = new ConfigService<Env, true>({
        ...TEST_ENV,
        NODE_ENV: 'test',
        SESSION_IDLE_TIMEOUT_MINUTES: 30,
        SESSION_MAX_AGE_HOURS: 12,
        ACCESS_TOKEN_TTL: '15m',
        MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      });
      users = new UsersRepository(db);
      mfa = new MfaService(db, config);
      auth = new AuthService(
        users,
        new SessionsRepository(db),
        new TokenService(config),
        config,
        mfa,
      );
      reset = new PasswordResetService(
        db,
        users,
        mfa,
        sender as unknown as EmailService,
        config,
      );
    });
    afterAll(async () => {
      await db?.end();
    });
    beforeEach(() => {
      sender.sendPasswordReset.mockReset();
      sender.sendPasswordReset.mockResolvedValue({
        id: 'test-message-id',
        retryable: false,
      });
    });
    async function identity() {
      const email = `${randomUUID()}@example.invalid`;
      return {
        email,
        ...(await auth.register(email, password, 'Reset', 'Test')),
      };
    }
    async function resetCode(userId: string) {
      const row = (
        await db.query(
          'SELECT reset_id,payload_ciphertext FROM auth_email_outbox WHERE reset_id IN (SELECT id FROM password_reset_requests WHERE user_id=$1) ORDER BY next_attempt_at DESC LIMIT 1',
          [userId],
        )
      ).rows[0];
      return JSON.parse(mfa.decrypt(row.payload_ciphertext, row.reset_id))
        .code as string;
    }
    async function verifyAndReset(
      requestToken: string,
      code: string,
      password: string,
    ) {
      const grant = await reset.verifyCode(requestToken, code);
      return reset.reset(grant.resetToken, password);
    }
    it('returns generic results without sending unknown accounts an email', async () => {
      const item = await identity();
      const known = await reset.request(item.email);
      const missing = await reset.request(`${randomUUID()}@example.invalid`);
      expect(known.message).toBe(missing.message);
      expect(known.requestToken).toHaveLength(missing.requestToken.length);
      const missingRows = await db.query(
        'SELECT count(*)::int AS count FROM password_reset_requests r JOIN auth_email_outbox o ON o.reset_id=r.id WHERE r.user_id IS NULL',
      );
      expect(missingRows.rows[0].count).toBe(0);
    });
    it('changes the password once while preserving MFA and recovery codes, and revokes sessions', async () => {
      const item = await identity();
      const setup = await auth.login(item.email, password);
      const pair = await auth.finishMfa(
        setup.challengeToken,
        await generate({ secret: setup.secret! }),
        'enroll',
      );
      if ('mfaRequired' in pair) throw new Error('Expected MFA session');
      const checkedCredentials = (await users.findByEmail(item.email))!;
      const before = (
        await db.query(
          'SELECT secret_ciphertext FROM user_mfa WHERE user_id=$1',
          [item.id],
        )
      ).rows[0].secret_ciphertext;
      const challenge = await auth.login(item.email, password);
      const request = await reset.request(item.email);
      const code = await resetCode(item.id);
      await verifyAndReset(
        request.requestToken,
        code,
        'my-new-secure-password',
      );
      await expect(
        verifyAndReset(request.requestToken, code, 'another-new-password'),
      ).rejects.toThrow();
      await expect(auth.login(item.email, password)).rejects.toThrow();
      await expect(mfa.start(checkedCredentials, 'login')).rejects.toThrow(
        'Credentials changed',
      );
      expect(
        await auth.login(item.email, 'my-new-secure-password'),
      ).toMatchObject({ purpose: 'login' });
      await expect(auth.refresh(pair.refreshToken)).rejects.toThrow();
      await expect(
        auth.finishMfa(
          challenge.challengeToken,
          pair.recoveryCodes![0],
          'login',
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.query(
            'SELECT secret_ciphertext FROM user_mfa WHERE user_id=$1',
            [item.id],
          )
        ).rows[0].secret_ciphertext,
      ).toBe(before);
      const next = await auth.login(item.email, 'my-new-secure-password');
      expect(
        await auth.finishMfa(
          next.challengeToken,
          pair.recoveryCodes![0],
          'login',
        ),
      ).toHaveProperty('accessToken');
    });
    it('limits guesses, expires requests and rate-limits repeated requests per account', async () => {
      const item = await identity();
      const request = await reset.request(item.email);
      const code = await resetCode(item.id);
      for (let i = 0; i < 5; i++)
        await expect(
          verifyAndReset(
            request.requestToken,
            code === '000000' ? '999999' : '000000',
            'replacement-password',
          ),
        ).rejects.toThrow();
      await expect(
        verifyAndReset(request.requestToken, code, 'replacement-password'),
      ).rejects.toThrow();
      await expect(reset.request(item.email)).rejects.toMatchObject({
        status: 429,
        response: { code: 'RESET_REQUEST_LIMIT' },
      });
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM password_reset_requests WHERE user_id=$1',
            [item.id],
          )
        ).rows[0].count,
      ).toBe(1);
      const other = await identity();
      const expired = await reset.request(other.email);
      const expiredCode = await resetCode(other.id);
      await db.query(
        "UPDATE password_reset_requests SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [other.id],
      );
      await expect(
        verifyAndReset(
          expired.requestToken,
          expiredCode,
          'replacement-password',
        ),
      ).rejects.toThrow();
      expect(
        await bcrypt.compare(
          password,
          (await users.findById(other.id))!.passwordHash,
        ),
      ).toBe(true);
    });
    it('allows only one of two concurrent resets to consume a code', async () => {
      const item = await identity();
      const request = await reset.request(item.email);
      const code = await resetCode(item.id);
      const results = await Promise.allSettled([
        verifyAndReset(request.requestToken, code, 'first-new-password'),
        verifyAndReset(request.requestToken, code, 'second-new-password'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('retries transient sends with a stable request ID and clears encrypted payload after acceptance', async () => {
      // Isolate delivery jobs created by the earlier cases.
      await db.query(
        'UPDATE auth_email_outbox SET failed_at=now(),payload_ciphertext=NULL WHERE sent_at IS NULL',
      );
      const item = await identity();
      await reset.request(item.email);
      sender.sendPasswordReset
        .mockResolvedValueOnce({
          retryable: true,
          errorCode: 'RESEND_HTTP_429',
          retryAfterSeconds: 45,
        })
        .mockResolvedValueOnce({ id: 'accepted-id', retryable: false });
      await reset.deliverPending();
      expect(sender.sendPasswordReset).toHaveBeenCalledTimes(1);
      const first = sender.sendPasswordReset.mock.calls[0];
      await db.query(
        "UPDATE auth_email_outbox SET next_attempt_at=now()-interval '1 second' WHERE failed_at IS NULL AND sent_at IS NULL",
      );
      await reset.deliverPending();
      expect(sender.sendPasswordReset.mock.calls[1]).toEqual(first);
      const row = (
        await db.query('SELECT * FROM auth_email_outbox WHERE reset_id=$1', [
          first[2],
        ])
      ).rows[0];
      expect(row.provider_message_id).toBe('accepted-id');
      expect(row.payload_ciphertext).toBeNull();
    });
    it('requires a verified grant and rejects the current password without consuming that grant', async () => {
      const item = await identity();
      const request = await reset.request(item.email);
      const code = await resetCode(item.id);
      await expect(
        reset.reset(request.requestToken, 'a-new-valid-password'),
      ).rejects.toThrow();
      const grant = await reset.verifyCode(request.requestToken, code);
      await expect(
        reset.verifyCode(request.requestToken, code),
      ).rejects.toThrow();
      await expect(
        reset.reset(grant.resetToken, password),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'PASSWORD_REUSED' },
      });
      expect(
        await bcrypt.compare(
          password,
          (await users.findById(item.id))!.passwordHash,
        ),
      ).toBe(true);
      await reset.reset(grant.resetToken, 'a-new-valid-password');
      await expect(
        reset.reset(grant.resetToken, 'another-valid-password'),
      ).rejects.toThrow();
    });
    it('expires verified grants and keeps cooldown requests from stranding the original code', async () => {
      const item = await identity();
      const request = await reset.request(item.email);
      const code = await resetCode(item.id);
      await expect(reset.request(item.email)).rejects.toMatchObject({
        status: 429,
        response: { code: 'RESET_REQUEST_LIMIT' },
      });
      const grant = await reset.verifyCode(request.requestToken, code);
      await db.query(
        "UPDATE password_reset_requests SET reset_grant_expires_at=now()-interval '1 second' WHERE user_id=$1",
        [item.id],
      );
      await expect(
        reset.reset(grant.resetToken, 'a-new-valid-password'),
      ).rejects.toThrow('expired');
      const unknown = `${randomUUID()}@example.invalid`;
      await reset.request(unknown);
      await expect(reset.request(unknown)).rejects.toMatchObject({
        status: 429,
        response: { code: 'RESET_REQUEST_LIMIT' },
      });
    });
    it('consumes a verified grant once under concurrent password changes', async () => {
      const item = await identity();
      const request = await reset.request(item.email);
      const grant = await reset.verifyCode(
        request.requestToken,
        await resetCode(item.id),
      );
      const results = await Promise.allSettled([
        reset.reset(grant.resetToken, 'first-valid-new-password'),
        reset.reset(grant.resetToken, 'second-valid-new-password'),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
    });
  },
);
