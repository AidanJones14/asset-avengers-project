import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

// One row per login. Many sessions per user are allowed (phone + laptop).
export interface Session {
  id: string;
  userId: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  mfaVerifiedAt: Date | null;
}

// What looking up a refresh token returns: the session it belongs to, plus
// whether this exact token was already exchanged once.
export interface RefreshTokenRecord {
  session: Session;
  usedAt: Date | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  mfa_verified_at: Date | null;
}

const toSession = (row: SessionRow): Session => ({
  id: row.id,
  userId: row.user_id,
  idleExpiresAt: row.idle_expires_at,
  absoluteExpiresAt: row.absolute_expires_at,
  revokedAt: row.revoked_at,
  mfaVerifiedAt: row.mfa_verified_at,
});

// Stores only sha256(refreshToken), never the token itself, so a leaked
// database can't be turned into working sessions.
@Injectable()
export class SessionsRepository {
  constructor(@Inject(PG_POOL) private readonly db: pg.Pool) {}

  // Starts a session and stores its first refresh token, atomically.
  async create(
    userId: string,
    tokenHash: Buffer,
    idleExpiresAt: Date,
    absoluteExpiresAt: Date,
    existingClient?: pg.PoolClient,
    mfaVerified = false,
    expectedPasswordHash?: string,
  ): Promise<Session> {
    const create = async (client: pg.PoolClient) => {
      // Recheck policy and credentials under the enrollment/reset lock: concurrent
      // setup or password changes must not leave a password-only login usable.
      const identity = (await client.query(
        'SELECT password_hash, roles, mfa_required FROM users WHERE id=$1 FOR UPDATE', [userId],
      )).rows[0];
      if (!identity || (expectedPasswordHash && identity.password_hash !== expectedPasswordHash))
        throw new UnauthorizedException('Credentials changed. Sign in again.');
      const enabled = await client.query(
        'SELECT enabled_at FROM user_mfa WHERE user_id=$1',
        [userId],
      );
      const enrolled = !!enabled.rows[0]?.enabled_at;
      const required = enrolled || identity.mfa_required || identity.roles.some((role: string) => role === 'ADMIN' || role === 'ANALYST');
      if ((required && !mfaVerified) || (mfaVerified && !enrolled))
        throw new UnauthorizedException('MFA verification is required');
      const { rows } = await client.query<SessionRow>(
        `INSERT INTO sessions (user_id, idle_expires_at, absolute_expires_at, mfa_verified_at) VALUES ($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END)
         RETURNING id, user_id, idle_expires_at, absolute_expires_at, revoked_at, mfa_verified_at`,
        [userId, idleExpiresAt, absoluteExpiresAt, mfaVerified],
      );
      await client.query(
        'INSERT INTO refresh_tokens (token_hash, session_id) VALUES ($1, $2)',
        [tokenHash, rows[0].id],
      );
      return toSession(rows[0]);
    };
    return existingClient ? create(existingClient) : this.inTransaction(create);
  }

  async findByTokenHash(tokenHash: Buffer): Promise<RefreshTokenRecord | null> {
    const { rows } = await this.db.query<SessionRow & { used_at: Date | null }>(
      `SELECT s.id, s.user_id, s.idle_expires_at, s.absolute_expires_at, s.revoked_at, s.mfa_verified_at, t.used_at
       FROM refresh_tokens t JOIN sessions s ON s.id = t.session_id
       WHERE t.token_hash = $1`,
      [tokenHash],
    );
    return rows[0]
      ? { session: toSession(rows[0]), usedAt: rows[0].used_at }
      : null;
  }

  // Swaps the old refresh token for a new one and pushes the idle deadline out.
  // Returns false if the old token was already used: two requests raced with
  // the same token, which must be treated as a replay.
  async rotate(
    sessionId: string,
    oldHash: Buffer,
    newHash: Buffer,
    idleExpiresAt: Date,
  ): Promise<boolean> {
    return this.inTransaction(async (client) => {
      // Enrollment revokes sessions; recheck under the session lock so an
      // already-started refresh cannot revive a revoked session.
      const active = await client.query(
        `SELECT id FROM sessions WHERE id=$1 AND revoked_at IS NULL
        AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE`,
        [sessionId],
      );
      if (!active.rowCount) return false;
      const marked = await client.query(
        'UPDATE refresh_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL',
        [oldHash],
      );
      if (marked.rowCount !== 1) return false;
      await client.query(
        'INSERT INTO refresh_tokens (token_hash, session_id) VALUES ($1, $2)',
        [newHash, sessionId],
      );
      await client.query(
        'UPDATE sessions SET idle_expires_at = $2 WHERE id = $1',
        [sessionId, idleExpiresAt],
      );
      return true;
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.query(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [sessionId],
    );
  }

  // BEGIN/COMMIT need every statement on the same connection, so check one out of the pool.
  private async inTransaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
