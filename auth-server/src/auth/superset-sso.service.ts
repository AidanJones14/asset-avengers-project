import { STAFF_MFA_WINDOW_MS } from './staff-session-policy.js';
/** Browser handoffs are random, hashed, single-use and bound to a live MFA session.
 * Superset redeems them over a server-only channel; no password/JWT crosses the browser URL. */
import { Inject, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

@Injectable()
export class SupersetSsoService {
  constructor(@Inject(PG_POOL) private readonly db: pg.Pool, private readonly config: ConfigService) {}
  private hash(value: string) { return createHash('sha256').update(value).digest(); }
  authenticateClient(secret?: string) {
    const expected = this.config.get<string>('SUPERSET_SSO_SECRET') || '';
    if (expected.length < 32) throw new ServiceUnavailableException('Superset SSO is not configured');
    if (!secret || !timingSafeEqual(this.hash(secret), this.hash(expected)))
      throw new UnauthorizedException('Invalid SSO client');
  }
  private validate(row: any) {
    if (!row || row.revoked_at || !row.mfa_verified_at ||
        new Date(row.idle_expires_at).getTime() <= Date.now() ||
        new Date(row.absolute_expires_at).getTime() <= Date.now() ||
        new Date(row.mfa_verified_at).getTime() + STAFF_MFA_WINDOW_MS <= Date.now() ||
        !row.roles.includes('ANALYST')) throw new UnauthorizedException('Sign in to J.A.R.V.I.S. again');
  }
  private identity(row: any) {
    return { subject: row.user_id, username: `endgame_${row.user_id}`, email: row.email,
      firstName: row.first_name || '', lastName: row.last_name || '',
      expiresAt: new Date(Math.min(new Date(row.idle_expires_at).getTime(), new Date(row.absolute_expires_at).getTime(), new Date(row.mfa_verified_at).getTime()+STAFF_MFA_WINDOW_MS)).toISOString() };
  }
  async issue(refreshToken: string) {
    if ((this.config.get<string>('SUPERSET_SSO_SECRET') || '').length < 32)
      throw new ServiceUnavailableException('Superset SSO is not configured');
    return this.transaction(async client => {
      const row = (await client.query(`SELECT s.*,u.roles FROM refresh_tokens t
        JOIN sessions s ON s.id=t.session_id JOIN users u ON u.id=s.user_id
        WHERE t.token_hash=$1 AND t.used_at IS NULL FOR UPDATE OF s`,[this.hash(refreshToken)])).rows[0];
      this.validate(row);
      const ticket = randomBytes(32).toString('base64url');
      await client.query(`DELETE FROM superset_sso_grants WHERE expires_at<now()
        AND (lease_expires_at IS NULL OR lease_expires_at<now())`);
      await client.query(`INSERT INTO superset_sso_grants(ticket_hash,session_id,expires_at)
        VALUES($1,$2,now()+interval '60 seconds')`,[this.hash(ticket),row.id]);
      return { ticket, expiresInSeconds: 60 };
    });
  }
  async exchange(ticket: string) {
    return this.transaction(async client => {
      const row = (await client.query(`SELECT g.*,s.user_id,s.revoked_at,s.mfa_verified_at,
        s.idle_expires_at,s.absolute_expires_at,u.roles,u.email,u.first_name,u.last_name
        FROM superset_sso_grants g JOIN sessions s ON s.id=g.session_id JOIN users u ON u.id=s.user_id
        WHERE g.ticket_hash=$1 AND g.consumed_at IS NULL AND g.expires_at>now() FOR UPDATE OF g,s`,[this.hash(ticket)])).rows[0];
      this.validate(row);
      const sessionToken = randomBytes(32).toString('base64url');
      await client.query(`UPDATE superset_sso_grants SET consumed_at=now(),lease_hash=$2,
        lease_expires_at=$3 WHERE ticket_hash=$1`,[this.hash(ticket),this.hash(sessionToken),row.absolute_expires_at]);
      return { ...this.identity(row), sessionToken };
    });
  }
  async session(sessionToken: string) {
    const row = (await this.db.query(`SELECT s.*,u.roles,u.email,u.first_name,u.last_name
      FROM superset_sso_grants g JOIN sessions s ON s.id=g.session_id JOIN users u ON u.id=s.user_id
      WHERE g.lease_hash=$1 AND g.consumed_at IS NOT NULL AND g.lease_expires_at>now()`,[this.hash(sessionToken)])).rows[0];
    this.validate(row);
    return this.identity(row);
  }
  private async transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try { await client.query('BEGIN'); const result=await work(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
