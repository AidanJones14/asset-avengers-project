import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PG_POOL } from '../src/database/database.module.js';
import { TEST_ENV } from './test-env.js';

// Staff-security plan sections 4.4-4.11, through real HTTP: the global JwtAuthGuard, @Public,
// @Roles and the staff routes' body rules. The database is a fake that answers every query with
// one empty row, so these tests prove who gets through the guards, not what the DB does
// (staff.service.spec.ts covers that against PostgreSQL).
describe('auth-server access control (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const fakePool = { query: async () => ({ rows: [{}] }), end: async () => {} };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL).useValue(fakePool).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, TEST_ENV.CORS_ALLOWED_ORIGIN);
    await app.init();
    // Listen once on loopback. Left to supertest, each request listens on '::' and macOS can
    // hand out a port another program holds on 127.0.0.1, which then answers instead (a stray 404).
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app.close(); });

  // A token signed with the real test secret. Defaults: what auth-server issues for an MFA-verified login.
  function token(roles: string[], claims: Record<string, unknown> = {}, audience: string[] = ['endgame-api', 'endgame-auth', 'endgame-staff']) {
    return jwt.sign({ roles, amr: ['pwd', 'mfa'], mfa_required: true, email: 'staff@example.com', ...claims },
      TEST_ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m', subject: randomUUID(), issuer: TEST_ENV.JWT_ISSUER, audience });
  }
  const http = () => request(app.getHttpServer());
  const newStaff = { email: 'new.person@example.com', firstName: 'New', lastName: 'Person' };

  // 1. @Public routes work without a token; Swagger is outside the guard entirely.
  it('health, Swagger and login need no token', async () => {
    await http().get('/health/live').expect(200);
    await http().get('/api-json').expect(200);
    // Reaches AuthService (the fake DB has no such user): a login answer, not the guard's refusal.
    const res = await http().post('/auth/login').send({ email: 'x@example.com', password: 'whatever' });
    expect(res.body.detail).not.toBe('Please log in again.');
  });

  // 2. Everything else needs a valid token: missing, wrong audience, password-only staff -> 401.
  it.each([
    ['no token', undefined],
    ['a malformed header', 'Token abc'],
    ['a forged signature', `Bearer ${jwt.sign({ roles: ['SUPER_ADMIN'], amr: ['pwd', 'mfa'] }, 'x'.repeat(40), { audience: 'endgame-auth', issuer: 'endgame-auth' })}`],
    ['a token not meant for auth-server (aud endgame-api only)', `Bearer ${token(['ADMIN'], {}, ['endgame-api'])}`],
    ['a password-only SUPER_ADMIN token', `Bearer ${token(['SUPER_ADMIN'], { amr: ['pwd'], mfa_required: false })}`],
  ])('profile and staff routes refuse %s with 401', async (_label, header) => {
    for (const path of ['/auth/profile', '/auth/admin/staff']) {
      const call = http().get(path);
      const res = await (header ? call.set('Authorization', header) : call);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
  });

  // 3. A valid token gets past the guard (the fake DB then answers).
  it('a valid client token reaches its own profile', async () => {
    await http().get('/auth/profile').set('Authorization', `Bearer ${token(['CLIENT'], { amr: ['pwd'], mfa_required: false }, ['endgame-api', 'endgame-auth'])}`).expect(200);
  });

  // 4. @Roles: who may call each staff route (D2).
  it.each([
    ['CLIENT', '/auth/admin/staff/analysts', 403],
    ['ANALYST', '/auth/admin/staff/analysts', 403],
    ['ADMIN', '/auth/admin/staff/admins', 403],
    ['ADMIN', '/auth/admin/staff/analysts', 201],
    ['SUPER_ADMIN', '/auth/admin/staff/analysts', 201],
    ['SUPER_ADMIN', '/auth/admin/staff/admins', 201],
  ])('%s POST %s -> %i', async (role, path, status) => {
    const res = await http().post(path).set('Authorization', `Bearer ${token([role])}`).send(newStaff).expect(status);
    if (status === 201) {
      expect(res.headers['cache-control']).toBe('no-store');
      expect(typeof res.body.temporaryPassword).toBe('string');
    }
  });
  it('ANALYST and CLIENT cannot list or disable staff', async () => {
    for (const role of ['ANALYST', 'CLIENT']) {
      await http().get('/auth/admin/staff').set('Authorization', `Bearer ${token([role])}`).expect(403);
      await http().post(`/auth/admin/staff/${randomUUID()}/disable`).set('Authorization', `Bearer ${token([role])}`).expect(403);
    }
  });

  // 5. The body can't choose a role (lecture 10's isAdmin example), and ids must be UUIDs.
  it('a body with a role field is rejected with 400', async () => {
    const res = await http().post('/auth/admin/staff/analysts').set('Authorization', `Bearer ${token(['SUPER_ADMIN'])}`)
      .send({ ...newStaff, role: 'SUPER_ADMIN' }).expect(400);
    expect(res.body.errors).toContainEqual({ field: 'role', message: 'property role should not exist' });
  });
  it('disable needs a UUID', async () => {
    await http().post('/auth/admin/staff/not-a-uuid/disable').set('Authorization', `Bearer ${token(['SUPER_ADMIN'])}`).expect(400);
  });

  // 6. D3 route is public and validates its body.
  it('change-temporary-password is public but validates the new password', async () => {
    await http().post('/auth/change-temporary-password').send({ email: 'x@example.com', password: 'temp', newPassword: 'short' }).expect(400);
  });
});
