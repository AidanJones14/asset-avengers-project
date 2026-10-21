import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { generate } from 'otplib';
import { SupersetSsoService } from './superset-sso.service.js';
import { MfaService } from './mfa.service.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { SessionsRepository } from './sessions.repository.js';
import { TEST_ENV } from '../../test/test-env.js';
import type { Env } from '../config/env.js';

it('requires the dedicated server client secret and fails closed when missing', () => {
  const service = new SupersetSsoService({} as pg.Pool,new ConfigService({SUPERSET_SSO_SECRET:'x'.repeat(32)}));
  expect(() => service.authenticateClient()).toThrow();
  expect(() => service.authenticateClient('wrong')).toThrow();
  expect(() => service.authenticateClient('x'.repeat(32))).not.toThrow();
  expect(() => new SupersetSsoService({} as pg.Pool,new ConfigService({})).authenticateClient('anything')).toThrow();
});
describe.skipIf(!process.env.MFA_TEST_DATABASE_URL)('Superset session-bound SSO PostgreSQL flow', () => {
  let db: pg.Pool; let auth: AuthService; let sso: SupersetSsoService;
  const password='sso-integration-password';
  beforeAll(async () => {
    db=new pg.Pool({connectionString:process.env.MFA_TEST_DATABASE_URL});
    await db.query(await readFile('../DB/auth_db.schema.sql','utf8'));
    const config=new ConfigService<Env,true>({...TEST_ENV,ACCESS_TOKEN_TTL:'15m',SESSION_IDLE_TIMEOUT_MINUTES:30,
      SESSION_MAX_AGE_HOURS:12,MFA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),SUPERSET_SSO_SECRET:'x'.repeat(32)});
    const mfa=new MfaService(db,config);
    auth=new AuthService(new UsersRepository(db),new SessionsRepository(db),new TokenService(config),config,mfa);
    sso=new SupersetSsoService(db,config);
  });
  afterAll(async () => { await db?.end(); });
  async function analyst() {
    const email=`${randomUUID()}@sso.test`;
    const user=await auth.register(email,password,'Jarvis','Analyst',true);
    await db.query("UPDATE users SET roles='{ANALYST}' WHERE id=$1",[user.id]);
    const setup=await auth.login(email,password);
    if (!('mfaRequired' in setup)) throw Error('Expected MFA enrollment');
    const pair=await auth.finishMfa(setup.challengeToken,await generate({secret:setup.secret!}),'enroll');
    if ('mfaRequired' in pair) throw Error('Expected completed MFA');
    return {user,pair};
  }
  it('exchanges one ticket once, preserves UUID identity and revokes access on logout', async () => {
    const {user,pair}=await analyst();
    const {ticket}=await sso.issue(pair.refreshToken);
    const results=await Promise.allSettled([sso.exchange(ticket),sso.exchange(ticket)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const granted=results.find(r=>r.status==='fulfilled');
    if (!granted || granted.status!=='fulfilled') throw Error('No grant');
    expect(granted.value).toMatchObject({subject:user.id,username:`endgame_${user.id}`});
    expect(await sso.session(granted.value.sessionToken)).toHaveProperty('subject',user.id);
    await auth.logout(pair.refreshToken);
    await expect(sso.session(granted.value.sessionToken)).rejects.toThrow();
  });
  it('rejects clients and password-only sessions even after an analyst role is added', async () => {
    const email=`${randomUUID()}@client.test`;
    const user=await auth.register(email,password,'Client','Only');
    const pair=await auth.login(email,password);
    if (!('refreshToken' in pair)) throw Error('Expected password-only client');
    await expect(sso.issue(pair.refreshToken)).rejects.toThrow();
    await db.query("UPDATE users SET roles='{ANALYST}' WHERE id=$1",[user.id]);
    await expect(sso.issue(pair.refreshToken)).rejects.toThrow();
  });
  it('rejects expired tickets and role removal during a live Superset session', async () => {
    const {user,pair}=await analyst();
    const first=await sso.issue(pair.refreshToken);
    await db.query("UPDATE superset_sso_grants SET expires_at=now()-interval '1 second' WHERE session_id IN (SELECT id FROM sessions WHERE user_id=$1)",[user.id]);
    await expect(sso.exchange(first.ticket)).rejects.toThrow();
    const second=await sso.issue(pair.refreshToken);
    const grant=await sso.exchange(second.ticket);
    await db.query("UPDATE users SET roles='{CLIENT}' WHERE id=$1",[user.id]);
    await expect(sso.session(grant.sessionToken)).rejects.toThrow();
  });
  it('rejects a handoff issued before session revocation or idle expiry', async () => {
    const {user,pair}=await analyst();
    const {ticket}=await sso.issue(pair.refreshToken);
    await auth.logout(pair.refreshToken);
    await expect(sso.exchange(ticket)).rejects.toThrow();
    const next=await analyst();
    const handoff=await sso.issue(next.pair.refreshToken);
    const grant=await sso.exchange(handoff.ticket);
    await db.query("UPDATE sessions SET idle_expires_at=now()-interval '1 second' WHERE user_id=$1",[next.user.id]);
    await expect(sso.session(grant.sessionToken)).rejects.toThrow();
  });
  it('expires Superset and refresh at eight hours even for a legacy longer session', async () => {
    const {user,pair}=await analyst();
    const handoff=await sso.issue(pair.refreshToken);
    const grant=await sso.exchange(handoff.ticket);
    await db.query("UPDATE sessions SET mfa_verified_at=now()-interval '8 hours',idle_expires_at=now()+interval '1 hour',absolute_expires_at=now()+interval '4 hours' WHERE user_id=$1",[user.id]);
    await expect(sso.session(grant.sessionToken)).rejects.toThrow();
    await expect(sso.issue(pair.refreshToken)).rejects.toThrow();
    await expect(auth.refresh(pair.refreshToken)).rejects.toThrow();
  });

});
