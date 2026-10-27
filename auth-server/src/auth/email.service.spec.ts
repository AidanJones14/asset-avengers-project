import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';
afterEach(() => vi.unstubAllGlobals());
it('uses the official SDK with server-only key, exact template variables and stable idempotency key', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const email = new EmailService(
    new ConfigService({
      RESEND_API_KEY: 're_test_not_a_real_key',
      EMAIL_FROM: 'Asset Avengers <security@assetavengers.top>',
      EMAIL_RESET_TEMPLATE_ID: 'template-id',
    }),
  );
  expect(
    await email.sendPasswordReset(
      'delivered@resend.dev',
      '012345',
      'request-id',
    ),
  ).toMatchObject({ id: 'email-id' });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(new Headers(options.headers).get('Idempotency-Key')).toBe(
    'password-reset/request-id',
  );
  expect(JSON.parse(options.body).template).toEqual({
    id: 'template-id',
    variables: { CODE: '012345', EXPIRES_MINUTES: 10 },
  });
});
it('classifies authentication errors as permanent and honors retry-after for rate limits', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'validation_error',
            message: 'Invalid key',
            statusCode: 401,
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'rate_limit_exceeded',
            message: 'slow down',
            statusCode: 429,
          }),
          { status: 429, headers: { 'retry-after': '60' } },
        ),
      ),
  );
  const email = new EmailService(
    new ConfigService({ RESEND_API_KEY: 're_test_not_a_real_key', EMAIL_FROM: 'Asset Avengers <security@assetavengers.top>' }),
  );
  expect(
    await email.sendPasswordReset(
      'delivered@resend.dev',
      '012345',
      'request-id',
    ),
  ).toMatchObject({ retryable: false, errorCode: 'RESEND_HTTP_401' });
  expect(
    await email.sendPasswordReset(
      'delivered@resend.dev',
      '012345',
      'request-id',
    ),
  ).toMatchObject({ retryable: true, retryAfterSeconds: 60 });
});

it('supports a plain-text reset with a sending-only key and no remote template', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: 'plain-email-id' }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetch);
  const email = new EmailService(
    new ConfigService({
      RESEND_API_KEY: 're_test_not_a_real_key',
      EMAIL_FROM: 'Asset Avengers <security@assetavengers.top>',
      EMAIL_RESET_TEMPLATE_ID: '',
    }),
  );
  expect(
    await email.sendPasswordReset(
      'delivered@resend.dev',
      '012345',
      'plain-request',
    ),
  ).toMatchObject({ id: 'plain-email-id' });
  const payload = JSON.parse(fetch.mock.calls[0][1].body);
  expect(payload.from).toBe('Asset Avengers <security@assetavengers.top>');
  expect(payload.template).toBeUndefined();
  expect(payload.html).toBeUndefined();
  expect(payload.text).toContain('012345');
  expect(payload.text).toContain('authenticator is still required');
});

it('identifies the Resend test-recipient restriction without retrying', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    name: 'validation_error', message: 'You can only send testing emails to your own email address', statusCode: 403,
  }), { status: 403 })));
  const service = new EmailService(new ConfigService({ RESEND_API_KEY: 're_test_not_a_real_key', EMAIL_FROM: 'Asset Avengers <security@assetavengers.top>' }));
  expect(await service.sendPasswordReset('other@example.invalid', '012345', 'restricted-test'))
    .toMatchObject({ retryable: false, errorCode: 'RESEND_TEST_RECIPIENT_RESTRICTED' });
});

it('requires an explicit sender instead of falling back to the Resend test domain', () => {
  const missing = new ConfigService({});
  missing.skipProcessEnv = true;
  expect(() => new EmailService(missing)).toThrow('EMAIL_FROM');
  expect(() => new EmailService(new ConfigService({ EMAIL_FROM: '   ' }))).toThrow('EMAIL_FROM');
});
