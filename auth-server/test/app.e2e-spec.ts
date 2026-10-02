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

  // Flips to 201 once you implement AuthService.register.
  it('a valid register body reaches AuthService (501 until implemented)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'a-long-enough-password' })
      .expect(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
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
});
