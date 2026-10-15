// Optional real-stack browser check, launched by verify-admin-stack.py --browser.
// Virtual localhost origins are mapped to disposable Docker containers, so no
// host ports or live application credentials/storage are used during this test.
import { chromium } from '@playwright/test';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(role) {
  const body = [encode({ alg: 'HS256', typ: 'JWT' }), encode({
    sub: '00000000-0000-0000-0000-000000000009', email: 'staff@example.invalid',
    roles: [role], iss: 'endgame-auth', aud: 'endgame-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
  })].join('.');
  return `${body}.${createHmac('sha256', process.env.TEST_JWT_SECRET).update(body).digest('base64url')}`;
}

const browser = await chromium.launch();
let page;
try {
  page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  for (const [origin, target] of [['http://localhost:8086', process.env.TEST_UI_TARGET], ['http://localhost:8088', process.env.TEST_SUPERSET_TARGET]]) {
    assert.ok(target, 'A disposable container target is required');
    await page.route(`${origin}/**`, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: target + url.pathname + url.search });
      await route.fulfill({ response });
    });
  }
  await page.goto('http://localhost:8086/admin.html');
  await page.getByText('Use an existing access token').click();
  await page.getByLabel('Staff access token').fill(token('ADMIN'));
  await page.getByRole('button', { name: 'Connect with token' }).click();
  await page.getByRole('button', { name: '30000000-0000-0000-0000-000000000001', exact: true }).click();
  await page.locator('#order-detail').waitFor({ state: 'visible' });
  assert.match(await page.locator('#pricing').textContent(), /Yes/);
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  assert.equal(await page.locator('#published-date').textContent(), '2026-10-01');
  const query = page.waitForResponse(response => response.url().includes('/api/v1/chart/data') && response.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  const response = await query;
  assert.equal(response.status(), 200, `Embedded chart request failed: ${await response.text()}`);
  const chart = await response.json();
  assert.ok(chart.result.some(result => result.data.some(row => Number(row.traded_notional) === 100)), 'The real embedded chart should show the seeded $100 trade');
  await mkdir('internal-frontend/test-results', { recursive: true });
  await page.screenshot({ path: 'internal-frontend/test-results/live-staff-report.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('http://localhost:8086/analyst.html');
  await page.getByText('Use an existing access token').click();
  await page.getByLabel('Staff access token').fill(token('ANALYST'));
  await page.getByRole('button', { name: 'Connect with token' }).click();
  await page.locator('#reports-panel').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Orders', exact: true }).isVisible(), false);
  console.log('Passed: real browser audit view, analyst permissions and embedded Superset chart data');
} finally {
  // Let proxied chart requests finish before disposing their request context.
  // The iframe can still have a second chart in flight when the assertions pass.
  await page?.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
