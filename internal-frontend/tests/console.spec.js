import { test, expect } from '@playwright/test';

// These fixtures exist only in browser tests. The shipped UI always calls the APIs.
const orderId = '30000000-0000-0000-0000-000000000001';
const accountId = '20000000-0000-0000-0000-000000000001';
const now = '2026-10-01T18:00:00Z';
function token(role, marker = 'first') {
  return ['header', Buffer.from(JSON.stringify({ sub: 'staff-test', email: `${role.toLowerCase()}@example.invalid`,
    roles: [role], exp: Math.floor(Date.now() / 1000) + 900, marker })).toString('base64url'), 'test-signature'].join('.');
}
const order = { orderId, accountId, symbol: 'AAPL', orderSide: 'buy', quantity: 2, status: 'filled', placedAt: now, cashChange: -100 };
const pageOf = items => ({ items, page: { page: 0, size: 20, totalElements: items.length, totalPages: items.length ? 1 : 0 } });

async function mockServices(page, role = 'ADMIN', { rotate = false } = {}) {
  const calls = { refresh: 0, logout: 0, command: null, authorized: [], guest: 0, schedule: null };
  const initial = token(role); const renewed = token(role, 'renewed');
  await page.route('**/auth/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/logout') { calls.logout++; return route.fulfill({ json: { loggedOut: true } }); }
    if (path === '/auth/refresh') {
      calls.refresh++;
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ json: { accessToken: renewed, refreshToken: 'rotated-test-token' } });
    }
    return route.fulfill({ json: { accessToken: initial, refreshToken: 'test-refresh-token' } });
  });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    calls.authorized.push(request.headers().authorization);
    if (rotate && request.headers().authorization === `Bearer ${initial}` && /trades|dashboards$/.test(path)) {
      return route.fulfill({ status: 401 });
    }
    if (path.endsWith('/pdf')) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nMock download for browser tests\n%%EOF' });
    if (path.endsWith('/analytics/report-schedule') && request.method() === 'PUT') {
      calls.schedule = request.postDataJSON();
      return route.fulfill({ json: { timezone: 'America/New_York', currentLocalTime: '19:00',
        nextLocalTime: calls.schedule.localTime, effectiveFrom: '2026-10-16' } });
    }
    if (path.endsWith('/analytics/status')) return route.fulfill({ json: {
      pipeline: { sourceHeartbeatAt: now, lagSeconds: 3 },
      latestBatch: { reportDate: '2026-10-01', status: 'published', startedAt: now },
      latestPublishedBatch: { reportDate: '2026-10-01', completedAt: now },
    } });
    if (path.endsWith('/analytics/dashboards')) return route.fulfill({ json: [{ dashboardKey: 'business-overview', title: 'Business overview' }] });
    if (path.endsWith('/guest-token')) {
      calls.guest++;
      return route.fulfill({ json: { guestToken: token('GUEST'), dashboardId: 'dashboard-test', supersetUrl: 'http://superset.test' } });
    }
    if (path.endsWith('/admin/trades')) return route.fulfill({ json: pageOf([order]) });
    if (path.endsWith('/timeline')) return route.fulfill({ json: { order, events: [
      { eventType: 'submitted', eventAt: now, terminal: false, provenance: 'recorded' },
      { eventType: 'rejected', eventAt: now, terminal: false, rejectionReason: 'Quote timestamp invalid', provenance: 'recorded' },
      { eventType: 'filled', eventAt: now, terminal: true, provenance: 'recorded' },
    ] } });
    if (path.endsWith('/pricing')) return route.fulfill({ json: [{ phase: 'execution', decision: 'observed', observedAt: now,
      quote: { bid: 49, ask: 50, stale: true, asOf: now } }] });
    if (path.endsWith('/export')) return route.fulfill({ json: { order, events: [], pricing: [], cashMovements: [] } });
    if (path.endsWith('/admin/clients')) return route.fulfill({ json: pageOf([{ accountId, clientId: 'client-test', email: 'client@example.invalid', cashBalance: 100, suspended: false, openPositions: 1 }]) });
    if (path.endsWith(`/accounts/${accountId}`)) return route.fulfill({ json: { account: { accountId, clientId: 'client-test', email: 'client@example.invalid', cashBalance: 100, suspended: false, asOf: now }, positions: [], recentActivity: [] } });
    if (path.endsWith('/suspend')) { calls.command = { path, body: request.postDataJSON() }; return route.fulfill({ json: { suspended: true } }); }
    if (path.endsWith('/audit-log')) return route.fulfill({ json: pageOf([]) });
    return route.fulfill({ status: 404, json: { detail: 'Unknown fixture endpoint' } });
  });
  await page.route('http://superset.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Embedded test fixture</h1>' }));
  return calls;
}

async function signIn(page, role = 'ADMIN') {
  await page.goto(role === 'ANALYST' ? '/analyst.html' : '/admin.html');
  await page.getByLabel('Email', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('admin inspects evidence, downloads audit and signs out without persisting tokens', async ({ page }) => {
  const calls = await mockServices(page);
  await signIn(page);
  await page.getByRole('button', { name: orderId, exact: true }).click();
  await expect(page.getByText('Execution attempt rejected · may retry')).toBeVisible();
  await expect(page.locator('#pricing')).toContainText('Yes');
  await page.screenshot({ path: 'test-results/staff-admin.png', fullPage: true });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download audit JSON' }).click();
  expect((await downloaded).suggestedFilename()).toBe(`order-${orderId}-audit.json`);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(calls.authorized.every(header => header?.startsWith('Bearer '))).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await expect(page.locator('#order-json')).toBeEmpty();
  expect(calls.logout).toBe(1);
});

test('analyst sees reporting and embeds with a guest token, without admin controls', async ({ page }) => {
  const calls = await mockServices(page, 'ANALYST');
  await signIn(page, 'ANALYST');
  await expect(page.getByRole('button', { name: 'Orders', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeHidden();
  await expect(page.locator('#published-date')).toHaveText('2026-10-01');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.locator('#dashboard-mount iframe')).toHaveAttribute('src', /superset\.test\/embedded\/dashboard-test/);
  await expect(page.locator('#dashboard-status')).toContainText('Showing published');
  expect(await page.locator('#dashboard-mount iframe').getAttribute('src')).not.toContain('guestToken');
  expect(calls.guest).toBe(1);
});

test('parallel API expiry rotates the refresh token only once', async ({ page }) => {
  const calls = await mockServices(page, 'ADMIN', { rotate: true });
  await signIn(page);
  await expect(page.getByRole('button', { name: orderId, exact: true })).toBeVisible();
  await expect(page.locator('#dashboard-key option')).toHaveCount(1);
  expect(calls.refresh).toBe(1);
});

test('client role cannot enter the staff workspace', async ({ page }) => {
  const calls = await mockServices(page, 'CLIENT');
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText('requires an ADMIN or ANALYST account');
  await expect(page.locator('#workspace')).toBeHidden();
  expect(calls.authorized).toHaveLength(0);
});

test('client lookup, deliberate suspension, errors and empty results are usable', async ({ page }) => {
  const calls = await mockServices(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByLabel('Email contains').fill('client');
  await page.getByRole('button', { name: 'Search clients' }).click();
  await page.getByRole('button', { name: 'client@example.invalid' }).click();
  await expect(page.getByText('No open positions.')).toBeVisible();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByLabel('Resource ID', { exact: true }).fill(accountId);
  await page.getByLabel('Reason', { exact: true }).fill('POC verification');
  await page.getByRole('button', { name: 'Apply action' }).click();
  await expect(page.locator('#action-result')).toContainText('Suspension applied');
  expect(calls.command).toEqual({ path: `/api/v1/admin/accounts/${accountId}/suspend`, body: { reason: 'POC verification' } });
  await page.route('**/api/v1/admin/trades?**', route => route.fulfill({ status: 503, json: { detail: '<b>Reporting unavailable</b>' } }));
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'Search orders' }).click();
  await expect(page.getByRole('alert')).toHaveText('<b>Reporting unavailable</b>');
  await expect(page.locator('#message b')).toHaveCount(0);
  await page.route('**/api/v1/admin/trades?**', route => route.fulfill({ json: pageOf([]) }));
  await page.getByRole('button', { name: 'Search orders' }).click();
  await expect(page.getByText('No records found.')).toBeVisible();
  await expect(page.locator('#orders-next')).toBeDisabled();
});

test('mobile layout fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockServices(page);
  await signIn(page);
  await expect(page.getByRole('button', { name: orderId, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: true });
});

test('analyst can save a shared next-day report time without changing todays cutoff', async ({ page }) => {
  const calls = await mockServices(page, 'ANALYST');
  await signIn(page, 'ANALYST');
  await page.getByLabel('Report time (New York)').fill('17:30');
  await page.getByRole('button', { name: 'Save report time' }).click();
  await expect(page.locator('#report-schedule-status')).toContainText('From 2026-10-16: 17:30');
  expect(calls.schedule).toEqual({ localTime: '17:30' });
  await expect(page.locator('#cutoff-time')).toHaveText('19:00 · New York');
  await expect(page.getByLabel('Report time (New York)')).toHaveValue('17:30');
});

test('login pages are separate and the admin page rejects an analyst session', async ({ page }) => {
  const calls = await mockServices(page, 'ANALYST');
  await signIn(page, 'ADMIN');
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await expect(page.locator('#message')).toContainText('requires ADMIN access');
  expect(calls.logout).toBe(1);
  const response = await page.request.get('/');
  expect(response.status()).toBe(404);
});

test('analyst downloads a published PDF report', async ({ page }) => {
  await mockServices(page, 'ANALYST');
  await signIn(page, 'ANALYST');
  await expect(page.getByRole('button', { name: 'Download staff audit PDF' })).toBeHidden();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report PDF', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe('report-2026-10-01.pdf');
});

test('admin downloads order evidence and staff audit log as PDFs', async ({ page }) => {
  await mockServices(page);
  await signIn(page);
  await page.getByRole('button', { name: orderId, exact: true }).click();
  let pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download audit PDF', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe(`order-${orderId}-audit.pdf`);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByLabel('Audit from (UTC)').fill('2026-10-01');
  await page.getByLabel('Audit through (UTC)').fill('2026-10-02');
  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download staff audit PDF' }).click();
  expect((await pending).suggestedFilename()).toBe('audit-log-2026-10-01-2026-10-02.pdf');
});
