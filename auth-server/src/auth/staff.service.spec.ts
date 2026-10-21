import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generate } from 'otplib';
import pg from 'pg';
import { AuthService } from './auth.service.js';
import { EmailService } from './email.service.js';
import { MfaService } from './mfa.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { StaffService } from './staff.service.js';
import { TokenService, type AccessTokenClaims } from './token.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { TEST_ENV } from '../../test/test-env.js';
import type { Env } from '../config/env.js';

// Staff-security plan D2-D7 against real PostgreSQL (same disposable-DB pattern as the MFA suite).
// The HTTP layer (guards, @Roles, body validation) is covered by test/access.e2e-spec.ts.
describe.skipIf(!process.env.MFA_TEST_DATABASE_URL)('Staff accounts, first-login password and disabled accounts (PostgreSQL)', () => {
  let db: pg.Pool;
  let users: UsersRepository;
  let auth: AuthService;
  let staff: StaffService;
  let reset: PasswordResetService;
  let mfa: MfaService;
  const demoPassword = 'staff-demo-password';

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: process.env.MFA_TEST_DATABASE_URL });
    await db.query(await readFile('../DB/auth_db.schema.sql', 'utf8'));
    const config = new ConfigService<Env, true>({
      ...TEST_ENV, NODE_ENV: 'test', ACCESS_TOKEN_TTL: '15m', SESSION_IDLE_TIMEOUT_MINUTES: 30,
      SESSION_MAX_AGE_HOURS: 12, MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    users = new UsersRepository(db);
    mfa = new MfaService(db, config);
    auth = new AuthService(users, new SessionsRepository(db), new TokenService(config), config, mfa);
    staff = new StaffService(users);
    reset = new PasswordResetService(db, users, mfa, { sendPasswordReset: vi.fn() } as unknown as EmailService, config);
  });
  afterAll(async () => { await db?.end(); });

  // An existing staff account (like the seeded ones) and the claims its MFA-verified token would carry.
  async function seeded(role: string) {
    const email = `${randomUUID()}@staff.test`;
    const { id } = await auth.register(email, demoPassword, 'Seeded', role, false);
    await db.query('UPDATE users SET roles = ARRAY[$2]::text[] WHERE id = $1', [id, role]);
    return { id, email, claims: { sub: id, roles: [role], amr: ['pwd', 'mfa'] } as AccessTokenClaims };
  }
  const sessionsOf = async (id: string) =>
    (await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [id])).rows[0].n as number;

  // 1. D2/D3: creation stores the route's role, requires MFA and a password change; email is never reused.
  it('a super admin creates an admin with a one-time temporary password', async () => {
    const boss = await seeded('SUPER_ADMIN');
    const email = `${randomUUID()}@new-admin.test`;
    const created = await staff.create(boss.claims, 'ADMIN', email, 'New', 'Admin');
    expect(created).toMatchObject({ email, role: 'ADMIN' });
    expect(created.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const row = (await db.query('SELECT roles, mfa_required, password_change_required, password_hash FROM users WHERE id = $1', [created.id])).rows[0];
    expect(row).toMatchObject({ roles: ['ADMIN'], mfa_required: true, password_change_required: true });
    expect(row.password_hash).not.toContain(created.temporaryPassword);
    expect((await staff.list(boss.claims)).map((account) => account.id)).toContain(created.id);
    await expect(staff.create(boss.claims, 'ANALYST', email, 'Again', 'Person')).rejects.toThrow('email is already registered');
  });

  // 2. D3: the temporary password gets no session, no authenticator and no reuse.
  it('first login forces a new password before MFA enrollment', async () => {
    const boss = await seeded('SUPER_ADMIN');
    const email = `${randomUUID()}@new-analyst.test`;
    const { id, temporaryPassword } = await staff.create(boss.claims, 'ANALYST', email, 'New', 'Analyst');
    // a. login answers with the required change only
    expect(await auth.login(email, temporaryPassword)).toEqual({ passwordChangeRequired: true });
    // b. no authenticator can be bound to the temporary password, and no session can be made
    await expect(auth.startMfa(email, temporaryPassword, 'enroll')).rejects.toMatchObject({ response: { code: 'PASSWORD_CHANGE_REQUIRED' } });
    await expect(new SessionsRepository(db).create(id, Buffer.alloc(32, 7), new Date(Date.now() + 60000),
      new Date(Date.now() + 120000), undefined, false)).rejects.toThrow('cannot sign in');
    expect(await sessionsOf(id)).toBe(0);
    // c. the new password must differ; then the flag clears and login continues to enrollment
    await expect(auth.changeTemporaryPassword(email, temporaryPassword, temporaryPassword)).rejects.toMatchObject({ response: { code: 'PASSWORD_REUSED' } });
    const next = await auth.changeTemporaryPassword(email, temporaryPassword, 'my-own-analyst-password');
    expect(next).toMatchObject({ mfaRequired: true, purpose: 'enroll', enrollmentRequired: true });
    expect((await users.findById(id))!.passwordChangeRequired).toBe(false);
    // d. the temporary password is dead, and the route can't be used twice
    await expect(auth.login(email, temporaryPassword)).rejects.toThrow('invalid email or password');
    await expect(auth.changeTemporaryPassword(email, 'my-own-analyst-password', 'yet-another-password')).rejects.toMatchObject({ response: { code: 'PASSWORD_CHANGE_NOT_REQUIRED' } });
  });

  // 3. D3: proving the inbox (password reset) also clears the flag.
  it('a password reset clears a pending temporary-password change', async () => {
    const boss = await seeded('SUPER_ADMIN');
    const email = `${randomUUID()}@reset.test`;
    const { id } = await staff.create(boss.claims, 'ANALYST', email, 'Reset', 'Analyst');
    const request = await reset.request(email);
    const outbox = (await db.query(
      'SELECT reset_id, payload_ciphertext FROM auth_email_outbox WHERE reset_id IN (SELECT id FROM password_reset_requests WHERE user_id = $1)', [id])).rows[0];
    const code = JSON.parse(mfa.decrypt(outbox.payload_ciphertext, outbox.reset_id)).code as string;
    await reset.reset((await reset.verifyCode(request.requestToken, code)).resetToken, 'chosen-by-the-analyst');
    expect((await users.findById(id))!.passwordChangeRequired).toBe(false);
    expect(await auth.login(email, 'chosen-by-the-analyst')).toMatchObject({ purpose: 'enroll' });
  });

  // 4. D4: which accounts each role may disable.
  it('applies the target rules for disabling', async () => {
    const boss = await seeded('SUPER_ADMIN');
    const otherBoss = await seeded('SUPER_ADMIN');
    const admin = await seeded('ADMIN');
    const otherAdmin = await seeded('ADMIN');
    const analyst = await seeded('ANALYST');
    const client = await auth.register(`${randomUUID()}@client.test`, demoPassword, 'A', 'Client', false);
    await expect(staff.setDisabled(admin.claims, otherAdmin.id, true)).rejects.toThrow('Admins can only manage analyst accounts.');
    await expect(staff.setDisabled(boss.claims, otherBoss.id, true)).rejects.toThrow('A super admin account cannot be changed here.');
    await expect(staff.setDisabled(admin.claims, admin.id, true)).rejects.toThrow('You cannot disable or enable your own account.');
    await expect(staff.setDisabled(boss.claims, client.id, true)).rejects.toThrow('Staff account not found');
    await expect(staff.setDisabled(boss.claims, randomUUID(), true)).rejects.toThrow('Staff account not found');
    await expect(staff.setDisabled(admin.claims, analyst.id, true)).resolves.toMatchObject({ id: analyst.id, disabledAt: expect.any(Date) });
    await expect(staff.setDisabled(boss.claims, otherAdmin.id, true)).resolves.toMatchObject({ id: otherAdmin.id });
  });

  // 5. D6: a disabled account loses its sessions and can't log in, refresh, reset, or act.
  it('a disabled account is locked out everywhere until re-enabled', async () => {
    const boss = await seeded('SUPER_ADMIN');
    const admin = await seeded('ADMIN');
    // a. the admin enrolls MFA and gets a real session
    const setup = await auth.login(admin.email, demoPassword);
    if (!('mfaRequired' in setup)) throw new Error('Expected MFA enrollment');
    const pair = await auth.finishMfa(setup.challengeToken, await generate({ secret: setup.secret! }), 'enroll');
    if (!('refreshToken' in pair)) throw new Error('Expected a session');
    // b. disable: sessions end, refresh fails, login says ACCOUNT_DISABLED (only with the right password)
    await staff.setDisabled(boss.claims, admin.id, true);
    expect(await sessionsOf(admin.id)).toBe(0);
    await expect(auth.refresh(pair.refreshToken)).rejects.toThrow('invalid or expired refresh token');
    await expect(auth.login(admin.email, demoPassword)).rejects.toMatchObject({ response: { code: 'ACCOUNT_DISABLED' } });
    await expect(auth.login(admin.email, 'a-wrong-password')).rejects.toThrow('invalid email or password');
    // c. no reset email is queued, and its still-valid access token can't manage staff
    await reset.request(admin.email);
    const queued = await db.query('SELECT count(*)::int AS n FROM auth_email_outbox o JOIN password_reset_requests r ON r.id = o.reset_id WHERE r.user_id = $1', [admin.id]);
    expect(queued.rows[0].n).toBe(0);
    await expect(staff.list(admin.claims)).rejects.toThrow('Please log in again.');
    // d. re-enabled: login works again (MFA still required)
    await staff.setDisabled(boss.claims, admin.id, false);
    expect(await auth.login(admin.email, demoPassword)).toMatchObject({ purpose: 'login' });
  });

  // 6. 4.9: the schema allows exactly one known role.
  it('the database refuses a second or unknown role', async () => {
    const { id } = await seeded('ANALYST');
    await expect(db.query("UPDATE users SET roles = '{CLIENT,SUPER_ADMIN}' WHERE id = $1", [id])).rejects.toThrow('users_roles_check');
    await expect(db.query("UPDATE users SET roles = '{OWNER}' WHERE id = $1", [id])).rejects.toThrow('users_roles_check');
  });
});
