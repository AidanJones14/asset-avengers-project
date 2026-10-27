/** Mandatory TOTP state machine. All mutations take the auth user's row lock.
 * Challenges carry no application authority. Replacement retains the working
 * authenticator until the new secret has been proved; password resets cannot
 * remove a factor. Secrets never enter trading, Kafka, reports or application logs. */
import {
  Inject,
  Injectable,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import pg from 'pg';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { PG_POOL } from '../database/database.module.js';
import { logAuthEvent } from '../common/log-auth-event.js';
import type { TokenPair } from './auth.service.js';
import type { User } from '../users/users.repository.js';
export type MfaPurpose = 'login' | 'enroll' | 'replace' | 'replace-enroll';
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  purpose: MfaPurpose;
  enrollmentRequired?: boolean;
  secret?: string;
  qrDataUrl?: string;
}
@Injectable()
export class MfaService {
  private readonly key?: Buffer;
  constructor(
    @Inject(PG_POOL) private readonly db: pg.Pool,
    config: ConfigService,
  ) {
    const value = config.get<string>('MFA_ENCRYPTION_KEY');
    if (value) this.key = Buffer.from(value, 'base64');
  }
  private requireKey(): Buffer {
    if (!this.key || this.key.length !== 32)
      throw new ServiceUnavailableException(
        'MFA encryption key is not configured',
      );
    return this.key;
  }
  // User/request binding is authenticated with the ciphertext, not merely stored next to it.
  encrypt(secret: string, owner: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv);
    cipher.setAAD(Buffer.from(owner));
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64',
    );
  }
  decrypt(value: string, owner: string): string {
    const bytes = Buffer.from(value, 'base64');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.requireKey(),
      bytes.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(owner));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString('utf8');
  }
  private hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
  async enabled(userId: string): Promise<boolean> {
    return !!(
      await this.db.query('SELECT enabled_at FROM user_mfa WHERE user_id=$1', [
        userId,
      ])
    ).rows[0]?.enabled_at;
  }
  private async describe(
    token: string,
    purpose: MfaPurpose,
    email: string,
    secret?: string,
  ): Promise<MfaChallenge> {
    return {
      mfaRequired: true,
      challengeToken: token,
      purpose,
      ...(['enroll', 'replace-enroll'].includes(purpose)
        ? { enrollmentRequired: true }
        : {}),
      ...(secret
        ? {
            secret,
            qrDataUrl: await QRCode.toDataURL(
              // Authenticator apps display the issuer as the account's service name.
              generateURI({ issuer: 'Endgame Trading', label: email, secret }),
            ),
          }
        : {}),
    };
  }
  async start(
    user: User,
    purpose: 'login' | 'enroll' | 'replace',
  ): Promise<MfaChallenge> {
    this.requireKey();
    const client = await this.db.connect();
    const token = randomBytes(32).toString('base64url');
    let secret: string | undefined;
    try {
      await client.query('BEGIN');
      const identity = (
        await client.query(
          'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
          [user.id],
        )
      ).rows[0];
      // A concurrent password reset must not leave a stale password check usable.
      if (!identity || identity.password_hash !== user.passwordHash)
        throw new UnauthorizedException('Credentials changed. Sign in again.');
      const state = (
        await client.query('SELECT * FROM user_mfa WHERE user_id=$1', [user.id])
      ).rows[0];
      if (state?.locked_until && new Date(state.locked_until) > new Date())
        throw new UnauthorizedException(
          'Too many MFA attempts. Try again in five minutes.',
        );
      if (purpose === 'enroll') {
        if (state?.enabled_at)
          throw new ConflictException('MFA is already enabled');
        secret = generateSecret();
        await client.query(
          `INSERT INTO user_mfa(user_id,secret_ciphertext) VALUES($1,$2)
          ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=$2,last_time_step=-1`,
          [user.id, this.encrypt(secret, user.id)],
        );
      } else if (!state?.enabled_at)
        throw new ConflictException('Authenticator setup is required');
      await client.query(
        'DELETE FROM mfa_challenges WHERE user_id=$1 OR expires_at<now()',
        [user.id],
      );
      await client.query(
        'INSERT INTO mfa_challenges(token_hash,user_id,purpose) VALUES($1,$2,$3)',
        [this.hash(token), user.id, purpose],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.describe(token, purpose, user.email, secret);
  }
  async complete(
    token: string,
    code: string,
    purpose: MfaPurpose,
    onLogin?: (userId: string, client: pg.PoolClient) => Promise<TokenPair>,
  ) {
    const client = await this.db.connect();
    let denied = false;
    let userId = '';
    let recoveryCodes: string[] | undefined;
    let tokens: TokenPair | undefined;
    let next: { token: string; email: string; secret: string } | undefined;
    try {
      await client.query('BEGIN');
      userId = (
        await client.query(
          'SELECT user_id FROM mfa_challenges WHERE token_hash=$1',
          [this.hash(token)],
        )
      ).rows[0]?.user_id;
      if (!userId)
        throw new UnauthorizedException('Invalid or expired MFA challenge');
      const user = (
        await client.query('SELECT email FROM users WHERE id=$1 FOR UPDATE', [
          userId,
        ])
      ).rows[0];
      const challenge = (
        await client.query(
          `SELECT * FROM mfa_challenges WHERE token_hash=$1 AND purpose=$2
        AND consumed_at IS NULL AND expires_at>now() AND attempts<5 FOR UPDATE`,
          [this.hash(token), purpose],
        )
      ).rows[0];
      const state = (
        await client.query(
          'SELECT * FROM user_mfa WHERE user_id=$1 FOR UPDATE',
          [userId],
        )
      ).rows[0];
      if (
        !user ||
        !challenge ||
        !state ||
        (state.locked_until && new Date(state.locked_until) > new Date())
      )
        throw new UnauthorizedException('Invalid or expired MFA challenge');
      if (purpose === 'enroll' ? !!state.enabled_at : !state.enabled_at)
        throw new UnauthorizedException('Invalid MFA state');
      const replacing = purpose === 'replace-enroll';
      let valid = false;
      let step: number | undefined;
      if (/^\d{6}$/.test(code)) {
        const result = await verify({
          secret: this.decrypt(
            replacing
              ? challenge.pending_secret_ciphertext
              : state.secret_ciphertext,
            userId,
          ),
          token: code,
          epochTolerance: 30,
          afterTimeStep:
            !replacing && Number(state.last_time_step) >= 0
              ? Number(state.last_time_step)
              : undefined,
        });
        valid = result.valid && 'timeStep' in result;
        if (result.valid && 'timeStep' in result) step = result.timeStep;
      } else if (
        ['login', 'replace'].includes(purpose) &&
        /^[a-f0-9]{16}$/.test(code)
      ) {
        valid = !!(
          await client.query(
            `UPDATE mfa_recovery_codes SET used_at=now()
          WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING user_id`,
            [userId, this.hash(code)],
          )
        ).rowCount;
      }
      if (!valid) {
        await client.query(
          'UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=$1',
          [this.hash(token)],
        );
        await client.query(
          `UPDATE user_mfa SET failures=CASE WHEN locked_until<now() THEN 1 ELSE failures+1 END,
          locked_until=CASE WHEN (CASE WHEN locked_until<now() THEN 1 ELSE failures+1 END)>=5 THEN now()+interval '5 minutes' ELSE NULL END WHERE user_id=$1`,
          [userId],
        );
        denied = true;
      } else {
        await client.query(
          'UPDATE mfa_challenges SET consumed_at=now(),pending_secret_ciphertext=NULL WHERE token_hash=$1',
          [this.hash(token)],
        );
        await client.query(
          'UPDATE user_mfa SET failures=0,locked_until=NULL,last_time_step=COALESCE($2,last_time_step) WHERE user_id=$1',
          [userId, step],
        );
        if (purpose === 'replace') {
          const replacement = generateSecret();
          const nextToken = randomBytes(32).toString('base64url');
          await client.query(
            `INSERT INTO mfa_challenges(token_hash,user_id,purpose,pending_secret_ciphertext) VALUES($1,$2,'replace-enroll',$3)`,
            [this.hash(nextToken), userId, this.encrypt(replacement, userId)],
          );
          next = { token: nextToken, email: user.email, secret: replacement };
        } else {
          if (purpose === 'enroll' || replacing) {
            recoveryCodes = Array.from({ length: 10 }, () =>
              randomBytes(8).toString('hex'),
            );
            await client.query(
              `UPDATE user_mfa SET enabled_at=now(),secret_ciphertext=COALESCE($2,secret_ciphertext) WHERE user_id=$1`,
              [userId, replacing ? challenge.pending_secret_ciphertext : null],
            );
            await client.query(
              'DELETE FROM mfa_recovery_codes WHERE user_id=$1',
              [userId],
            );
            for (const recovery of recoveryCodes)
              await client.query(
                'INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',
                [userId, this.hash(recovery)],
              );
            await client.query(
              'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
              [userId],
            );
          }
          // Session and consumed second factor commit together; no partial proof consumption.
          if (onLogin) tokens = await onLogin(userId, client);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    logAuthEvent(
      denied
        ? 'mfa_failure'
        : purpose === 'enroll'
          ? 'mfa_enabled'
          : 'mfa_verified',
      userId,
    );
    if (denied)
      throw new UnauthorizedException(
        'Invalid or already used code. Try a new code or a recovery code.',
      );
    return {
      userId,
      recoveryCodes,
      tokens,
      nextChallenge: next
        ? await this.describe(
            next.token,
            'replace-enroll',
            next.email,
            next.secret,
          )
        : undefined,
    };
  }
}
