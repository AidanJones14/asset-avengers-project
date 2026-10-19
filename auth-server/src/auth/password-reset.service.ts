/** Password reset is distinct from MFA recovery. A reset changes the bcrypt hash,
 * revokes sessions and invalidates outstanding challenges, but retains the user's
 * authenticator and recovery codes. Email I/O runs outside the HTTP request. */
import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import { UsersRepository } from '../users/users.repository.js';
import { MfaService } from './mfa.service.js';
import { EmailService } from './email.service.js';
import { logAuthEvent } from '../common/log-auth-event.js';
const MESSAGE =
  'If an account exists for that email, a reset code will be sent. Codes expire after 10 minutes.';
@Injectable()
export class PasswordResetService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly pepper: Buffer;
  private readonly workerEnabled: boolean;
  private timer?: ReturnType<typeof setInterval>;
  private working?: Promise<void>;
  private readonly logger = new Logger(PasswordResetService.name);
  constructor(
    @Inject(PG_POOL) private readonly db: pg.Pool,
    private readonly users: UsersRepository,
    private readonly mfa: MfaService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.pepper = Buffer.from(
      config.get<string>('MFA_ENCRYPTION_KEY') || '',
      'base64',
    );
    this.workerEnabled = config.get('NODE_ENV') !== 'test';
  }
  private hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
  private codeHash(id: string, code: string): Buffer {
    if (this.pepper.length !== 32)
      throw new ServiceUnavailableException(
        'Password reset encryption is not configured',
      );
    return createHmac('sha256', this.pepper)
      .update(`password-reset:${id}:${code}`)
      .digest();
  }
  async request(email: string) {
    const requestToken = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const hash = this.codeHash(id, code);
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = createHmac('sha256', this.pepper)
      .update(`reset-email:${normalizedEmail}`)
      .digest();
    const user = await this.users.findByEmail(normalizedEmail);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Cleanup uses no network and no user-provided SQL identifiers.
      await client.query(
        "DELETE FROM password_reset_requests WHERE created_at<now()-interval '1 day'",
      );
      // Serialize per-email throttling for known AND unknown emails. Returning a
      // fresh unusable token during cooldown previously stranded legitimate users.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [emailHash.toString('hex')],
      );
      const recent = (
        await client.query(
          `SELECT count(*)::int AS count,max(created_at) AS latest
        FROM password_reset_requests WHERE (email_hash=$1 OR ($2::uuid IS NOT NULL AND user_id=$2))
        AND created_at>now()-interval '15 minutes'`,
          [emailHash, user?.id ?? null],
        )
      ).rows[0];
      const elapsed = recent.latest
        ? Date.now() - new Date(recent.latest).getTime()
        : Infinity;
      if (recent.count >= 3 || elapsed < 60000)
        throw new HttpException(
          {
            title: 'Too Many Requests',
            code: 'RESET_REQUEST_LIMIT',
            detail:
              recent.count >= 3
                ? 'Too many reset requests. Wait 15 minutes before requesting another code.'
                : 'Wait one minute before requesting another code. Use the most recent code already requested.',
          },
          429,
        );
      if (user) {
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          user.id,
        ]);
        await client.query(
          'UPDATE password_reset_requests SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',
          [user.id],
        );
      }
      // Unknown emails receive an indistinguishable challenge without a delivery job.
      await client.query(
        `INSERT INTO password_reset_requests(id,token_hash,user_id,code_hash,email_hash) VALUES($1,$2,$3,$4,$5)`,
        [id, this.hash(requestToken), user?.id ?? null, hash, emailHash],
      );
      if (user)
        await client.query(
          'INSERT INTO auth_email_outbox(reset_id,payload_ciphertext) VALUES($1,$2)',
          [id, this.mfa.encrypt(JSON.stringify({ to: user.email, code }), id)],
        );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { message: MESSAGE, requestToken };
  }
  async verifyCode(requestToken: string, code: string) {
    const client = await this.db.connect();
    let denied = false;
    const resetToken = randomBytes(32).toString('base64url');
    try {
      await client.query('BEGIN');
      const found = (
        await client.query(
          'SELECT user_id FROM password_reset_requests WHERE token_hash=$1',
          [this.hash(requestToken)],
        )
      ).rows[0];
      if (found?.user_id)
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          found.user_id,
        ]);
      const row = (
        await client.query(
          `SELECT * FROM password_reset_requests WHERE token_hash=$1 AND consumed_at IS NULL
        AND verified_at IS NULL AND expires_at>now() AND attempts<5 FOR UPDATE`,
          [this.hash(requestToken)],
        )
      ).rows[0];
      if (!row)
        throw new UnauthorizedException(
          'Invalid or expired reset code. Request a new code.',
        );
      if (
        !row.user_id ||
        !timingSafeEqual(this.codeHash(row.id, code), row.code_hash)
      ) {
        await client.query(
          'UPDATE password_reset_requests SET attempts=attempts+1 WHERE id=$1',
          [row.id],
        );
        denied = true;
      } else {
        // Consume the code at verification, retaining only a hashed grant for the
        // password step. A repeated code submission cannot mint another grant.
        await client.query(
          `UPDATE password_reset_requests SET verified_at=now(),reset_grant_hash=$2,
          reset_grant_expires_at=now()+interval '5 minutes',code_hash=$3 WHERE id=$1`,
          [row.id, this.hash(resetToken), randomBytes(32)],
        );
        await client.query(
          `UPDATE auth_email_outbox SET payload_ciphertext=NULL,failed_at=now()
          WHERE reset_id=$1 AND sent_at IS NULL`,
          [row.id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (denied)
      throw new UnauthorizedException(
        'Invalid or expired reset code. Check the code and try again.',
      );
    return {
      resetToken,
      expiresInSeconds: 300,
      message: 'Email code verified. Choose a new password.',
    };
  }
  async reset(resetToken: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const client = await this.db.connect();
    let userId: string | undefined;
    try {
      await client.query('BEGIN');
      const found = (
        await client.query(
          'SELECT user_id FROM password_reset_requests WHERE reset_grant_hash=$1',
          [this.hash(resetToken)],
        )
      ).rows[0];
      userId = found?.user_id;
      const user = userId
        ? (
            await client.query(
              'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
              [userId],
            )
          ).rows[0]
        : null;
      const row = (
        await client.query(
          `SELECT id FROM password_reset_requests WHERE reset_grant_hash=$1
        AND verified_at IS NOT NULL AND consumed_at IS NULL AND reset_grant_expires_at>now() FOR UPDATE`,
          [this.hash(resetToken)],
        )
      ).rows[0];
      if (!row || !user)
        throw new UnauthorizedException(
          'Your password reset has expired. Request and verify a new code.',
        );
      // Only the server can compare with the stored bcrypt hash. Keep a verified
      // grant usable after this error so the user can choose a different password.
      if (await bcrypt.compare(newPassword, user.password_hash))
        throw new BadRequestException({
          title: 'Bad Request',
          code: 'PASSWORD_REUSED',
          detail:
            'Your new password must be different from your current password.',
        });
      await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        userId,
        passwordHash,
      ]);
      await client.query(
        'UPDATE password_reset_requests SET consumed_at=now(),reset_grant_hash=NULL WHERE user_id=$1 AND consumed_at IS NULL',
        [userId],
      );
      await client.query(
        'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [userId],
      );
      await client.query('DELETE FROM mfa_challenges WHERE user_id=$1', [
        userId,
      ]);
      await client.query(
        `UPDATE auth_email_outbox SET payload_ciphertext=NULL,failed_at=COALESCE(failed_at,now())
        WHERE reset_id IN (SELECT id FROM password_reset_requests WHERE user_id=$1) AND sent_at IS NULL`,
        [userId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    logAuthEvent('password_reset', userId);
    return {
      success: true,
      message:
        'Password updated. Sign in with your new password and authenticator.',
    };
  }
  onApplicationBootstrap() {
    if (!this.workerEnabled) return;
    this.timer = setInterval(() => {
      if (!this.working)
        this.working = this.deliverPending()
          .catch(() => {
            this.logger.error(
              'Password reset delivery worker failed; retrying.',
            );
          })
          .finally(() => {
            this.working = undefined;
          });
    }, 5000);
    this.timer.unref();
  }
  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.working;
  }
  async deliverPending() {
    // One statement leases a job. Network calls never hold a DB transaction open.
    await this.db
      .query(`UPDATE auth_email_outbox o SET payload_ciphertext=NULL,failed_at=now(),last_error_code='EXPIRED'
      FROM password_reset_requests r WHERE o.reset_id=r.id AND o.sent_at IS NULL AND o.failed_at IS NULL
      AND (r.expires_at<=now() OR r.consumed_at IS NOT NULL OR r.verified_at IS NOT NULL)`);
    const row = (
      await this.db
        .query(`UPDATE auth_email_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '60 seconds'
      WHERE reset_id=(SELECT o.reset_id FROM auth_email_outbox o JOIN password_reset_requests r ON r.id=o.reset_id
        WHERE o.sent_at IS NULL AND o.failed_at IS NULL AND o.next_attempt_at<=now() AND r.expires_at>now()
        AND r.consumed_at IS NULL AND r.verified_at IS NULL ORDER BY o.next_attempt_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED)
      RETURNING *`)
    ).rows[0];
    if (!row) return;
    const payload = JSON.parse(
      this.mfa.decrypt(row.payload_ciphertext, row.reset_id),
    ) as { to: string; code: string };
    const result = await this.email.sendPasswordReset(
      payload.to,
      payload.code,
      row.reset_id,
    );
    if (result.id)
      await this.db.query(
        `UPDATE auth_email_outbox SET sent_at=now(),provider_message_id=$2,payload_ciphertext=NULL,last_error_code=NULL WHERE reset_id=$1`,
        [row.reset_id, result.id],
      );
    else {
      const retry = result.retryable && row.attempts < 5;
      const delay = Math.max(
        result.retryAfterSeconds ?? 0,
        Math.min(300, 5 * 2 ** row.attempts),
      );
      await this.db.query(
        `UPDATE auth_email_outbox SET next_attempt_at=now()+($2*interval '1 second'),last_error_code=$3,
        failed_at=CASE WHEN $4 THEN NULL ELSE now() END,payload_ciphertext=CASE WHEN $4 THEN payload_ciphertext ELSE NULL END WHERE reset_id=$1`,
        [row.reset_id, delay, result.errorCode ?? 'EMAIL_ERROR', retry],
      );
      this.logger.warn(
        `password_reset_email ${result.errorCode ?? 'EMAIL_ERROR'} retry=${retry}`,
      );
    }
  }
}
