import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PG_POOL } from '../src/database/database.module.js';
import { TEST_ENV } from './test-env.js';

// Boots the real app through HTTP with the database swapped for a fake, to prove
// the wiring: routing, validation, error format, Swagger. No Postgres needed.
describe('auth-server (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const fakePool = {
      query: async () => ({ rows: [{}] }),
      end: async () => {},
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(fakePool)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app, TEST_ENV.CORS_ALLOWED_ORIGIN);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/ready returns ok when the db answers', () =>
    request(app.getHttpServer())
      .get('/health/ready')
      .expect(200, { status: 'ok' }));

  it('unknown routes return an ApiError body', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('malformed JSON returns 400 MALFORMED_JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('content-type', 'application/json')
      .send('{not json')
      .expect(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
    // helmet and CORS run before the parser, so even this error is readable by the browser.
    expect(res.headers['access-control-allow-origin']).toBe(
      TEST_ENV.CORS_ALLOWED_ORIGIN,
    );
  });

  it('bodies over the size limit return 413', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ padding: 'x'.repeat(20_000) })
      .expect(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('register rejects fields the DTO does not declare (lecture 10)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'alice@example.com',
        password: 'a-long-enough-password',
        roles: ['ADMIN'],
      })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(res.body.errors).toContainEqual({
      field: 'roles',
      message: 'property roles should not exist',
    });
  });

  it('register reports every invalid field at once', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });

  // Only proves the route reaches AuthService. The fake pool answers every query with
  // an empty row, so id and email come back undefined here; the unit tests and the
  // curl/psql check cover the real values.
  it('rejects a string instead of a boolean MFA choice', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'alice@example.com', password: 'a-long-enough-password', firstName: 'Test', lastName: 'Client', mfaEnabled: 'false',
    }).expect(400);
  });
  it('a valid register body returns 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'a-long-enough-password', firstName: 'Cameron', lastName: 'Kelly' })
      .expect(201);
    expect(res.body.registered).toBe(true);
  });

  it('registration requires nonblank first and last names', async () => {
    for (const firstName of [undefined, '', '   ', 'x'.repeat(101)]) {
      await request(app.getHttpServer()).post('/auth/register')
        .send({ email: 'name@example.com', password: 'a-long-enough-password', firstName, lastName: 'Kelly' })
        .expect(400);
    }
  });

  // Each route has its own count, so this uses up only /auth/logout's limit.
  it('the 21st request to one auth route in 15 minutes is rate limited', async () => {
    let last: request.Response | undefined;
    for (let i = 0; i < 21; i++) {
      last = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'x' });
    }
    expect(last!.status).toBe(429);
    expect(last!.body).toMatchObject({
      title: 'Too Many Requests',
      code: 'RATE_LIMITED',
    });
  });

  it('serves the OpenAPI document with all four auth routes', async () => {
    const res = await request(app.getHttpServer()).get('/api-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/register',
        '/auth/login',
        '/auth/refresh',
        '/auth/logout',
      ]),
    );
  });
  it('validates MFA challenges and rejects extra caller-supplied identity fields', async () => {
    for (const body of [
      {challengeToken: 'short', code: '123456'},
      {challengeToken: 'x'.repeat(43), code: 123456},
      {challengeToken: 'x'.repeat(43), code: '123456', userId: 'other-user'},
    ]) {
      const response = await request(app.getHttpServer()).post('/auth/mfa/verify').send(body).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
  });
  it('documents password login as either tokens or an MFA challenge', async () => {
    const response = await request(app.getHttpServer()).get('/api-json').expect(200);
    expect(response.body.paths['/auth/login'].post.responses['200'].content['application/json'].schema.oneOf)
      .toEqual([{ $ref: '#/components/schemas/TokenPairDto' }, { $ref: '#/components/schemas/MfaChallengeDto' }]);
  });

  it('validates email-code verification separately from password changes',async()=>{
    await request(app.getHttpServer()).post('/auth/verify-reset-code').send({requestToken:'x'.repeat(43),code:123456}).expect(400);
    await request(app.getHttpServer()).post('/auth/reset-password').send({requestToken:'x'.repeat(43),code:'123456',newPassword:'new-long-password'}).expect(400);
  });

  it('refuses MFA removal and validates reset requests without accepting injected user IDs',async()=>{
    for(const path of ['/auth/mfa/disable','/auth/mfa/disable/start']) await request(app.getHttpServer()).post(path).send({}).expect(403);
    await request(app.getHttpServer()).post('/auth/forgot-password').send({email:'not-email'}).expect(400);
    await request(app.getHttpServer()).post('/auth/reset-password').send({resetToken:'x'.repeat(43),newPassword:'new-long-password',userId:'other'}).expect(400);
  });

  it('protects SSO backchannels and validates handoff bodies', async () => {
    await request(app.getHttpServer()).post('/auth/superset/ticket').send({refreshToken: 123}).expect(400);
    await request(app.getHttpServer()).post('/auth/superset/exchange').send({ticket: 'bad'}).expect(400);
    await request(app.getHttpServer()).post('/auth/superset/exchange').send({ticket: 't'.repeat(43)}).expect(401);
    await request(app.getHttpServer()).post('/auth/superset/session').set('X-Endgame-SSO-Secret','wrong')
      .send({sessionToken: 's'.repeat(43)}).expect(401);
  });

});
