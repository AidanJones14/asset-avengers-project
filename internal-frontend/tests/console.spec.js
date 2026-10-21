import { test, expect } from '@playwright/test';

// These fixtures exist only in browser tests. The shipped UI always calls the APIs.
const orderId = '30000000-0000-0000-0000-000000000001';
const accountId = '20000000-0000-0000-0000-000000000001';
const now = '2026-10-01T18:00:00Z';
function token(role, marker = 'first') {
  return ['header', Buffer.from(JSON.stringify({ sub: 'staff-test', email: `${role.toLowerCase()}@example.invalid`,
    roles: [role], exp: Math.floor(Date.now() / 1000) + 900, marker })).toString('base64url'), 'test-signature'].join('.');
}
const order = { clientName: 'Cameron Kelly', clientId: 'client-test', orderId, accountId, symbol: 'AAPL', orderSide: 'buy', quantity: 2, status: 'filled', placedAt: now, cashChange: -100 };
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
    if (path.endsWith('/analytics/clients/suggestions')) return route.fulfill({ json: [] });
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
    if (path.endsWith('/admin/clients/suggestions')) return route.fulfill({ json: [{ clientId: 'client-test', accountId, fullName: 'Cameron Kelly', email: 'client@example.invalid', suspended: false }] });
    if (path.endsWith('/admin/clients')) return route.fulfill({ json: pageOf([{ accountId, clientId: 'client-test', email: 'client@example.invalid', cashBalance: 100, suspended: false, openPositions: 1 }]) });
    if (path.endsWith(`/accounts/${accountId}`)) return route.fulfill({ json: { account: { accountId, clientId: 'client-test', email: 'client@example.invalid', cashBalance: 100, suspended: false, asOf: now }, positions: [], recentActivity: [] } });
    if (path.endsWith('/suspend') || path.endsWith('/unsuspend')) { calls.command = { path, body: request.postDataJSON() }; return route.fulfill({ json: { suspended: true } }); }
    if (path.endsWith('/audit-log')) return route.fulfill({ json: pageOf([]) });
    return route.fulfill({ status: 404, json: { detail: 'Unknown fixture endpoint' } });
  });
  await page.route('http://superset.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Embedded test fixture</h1>' }));
  return calls;
}

async function signIn(page, role = 'ADMIN') {
  await page.goto(role === 'ANALYST' ? '/analyst' : '/admin');
  await page.getByLabel('Email', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('admin inspects evidence, downloads audit and signs out without persisting tokens', async ({ page }) => {
  const calls = await mockServices(page);
  await signIn(page);
  await expect(page.locator('#orders-results')).toContainText('Cameron Kelly');
  await page.getByRole('button', { name: orderId, exact: true }).click();
  await expect(page.locator('#order-summary')).toContainText('Cameron Kelly');
  await expect(page.getByText('Execution attempt rejected · may retry')).toBeVisible();
  await expect(page.locator('#pricing')).toContainText('Yes');
  await page.screenshot({ path: 'test-results/staff-admin.png', fullPage: true });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download audit JSON' }).click();
  expect((await downloaded).suggestedFilename()).toBe(`order-${orderId}-audit.json`);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(calls.authorized.every(header => header?.startsWith('Bearer '))).toBe(true);
  await page.locator('#logout').click();
  await page.locator('#confirm-logout').click();
  await expect(page.getByRole('heading', { name: 'Ultron sign in' })).toBeVisible();
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
  await page.getByLabel('Name or email', { exact: true }).fill('client');
  await page.getByRole('button', { name: 'Search clients' }).click();
  await page.getByRole('button', { name: 'client@example.invalid' }).click();
  await expect(page.getByText('No open positions.')).toBeVisible();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.locator('#action-client-query').fill('ca');
  await page.locator('#action-client-results button', { hasText: 'Cameron Kelly' }).click();
  await page.getByLabel('Reason', { exact: true }).fill('local deployment verification');
  await page.getByRole('button', { name: 'Apply action' }).click();
  await expect(page.locator('#action-result')).toContainText('Suspension applied');
  expect(calls.command).toEqual({ path: `/api/v1/admin/accounts/${accountId}/suspend`, body: { reason: 'local deployment verification' } });
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
  await expect(page.getByRole('heading', { name: 'Ultron sign in' })).toBeVisible();
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


test('analyst can queue a daily report and see it finish', async ({ page }) => {
  await mockServices(page, 'ANALYST');
  let queued = false;
  let reads = 0;
  await page.route('**/api/v1/analytics/report-requests', route => {
    queued = true;
    return route.fulfill({ status: 202, json: { requestId: 'request-test', status: 'queued' } });
  });
  await page.route('**/api/v1/analytics/status', route => route.fulfill({ json: {
    latestReportRequest: queued ? { status: ++reads > 1 ? 'published' : 'queued', cutoffAt: now } : null,
  } }));
  await page.goto('/analyst');
  await page.locator('#login-form input[name=email]').fill('analyst@example.invalid');
  await page.locator('#login-form input[name=password]').fill('test-password');
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('#generate-report').click();
  await expect(page.locator('#generate-report')).toBeDisabled();
  await expect(page.locator('#manual-report-status')).toContainText('Queued through');
  await expect(page.locator('#manual-report-status')).toContainText('Report ready through', { timeout: 10000 });
  await expect(page.locator('#generate-report')).toBeEnabled();
});


test('name suggestions narrow as the analyst types and show only published activity', async ({ page }) => {
  await mockServices(page, 'ANALYST');
  const queries = [];
  await page.route('**/analytics/clients/suggestions?*', route => {
    const q = new URL(route.request().url()).searchParams.get('q'); queries.push(q);
    const rows = q === 'ca' ? [{ clientId: 'one', fullName: 'Cameron Kelly' }, { clientId: 'two', fullName: 'Carol Jones' }]
      : [{ clientId: 'one', fullName: 'Cameron Kelly' }];
    return route.fulfill({ json: rows });
  });
  await page.route('**/analytics/clients/one/activity', route => route.fulfill({ json: [] }));
  await page.goto('/analyst');
  await page.locator('#login-form input[name=email]').fill('analyst@example.invalid');
  await page.locator('#login-form input[name=password]').fill('test-password');
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('#client-name-query').fill('ca');
  await expect(page.locator('#client-name-results')).toContainText('Carol Jones');
  await page.locator('#client-name-query').fill('cam');
  await expect(page.locator('#client-name-results')).not.toContainText('Carol Jones');
  await expect(page.locator('#client-name-results')).toContainText('Cameron Kelly');
  await page.locator('#client-name-results button').click();
  await expect(page.locator('#client-name-activity')).toContainText('No published trades');
  expect(queries).toEqual(['ca', 'cam']);
});


test('admin client search runs while typing and clears stale empty results', async ({ page }) => {
  await mockServices(page, 'ADMIN');
  await page.route('**/admin/clients?*', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({ json: pageOf(query === 'nobody' ? [] : [{ accountId, clientId: 'client-test', email: 'client@example.invalid', cashBalance: 100, suspended: false, openPositions: 1 }]) });
  });
  await page.goto('/admin');
  await page.locator('#login-form input[name=email]').fill('admin@example.invalid');
  await page.locator('#login-form input[name=password]').fill('test-password');
  await page.locator('#login-form button[type=submit]').click();
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  const query = page.locator('#admin-client-name-query');
  await query.fill('nobody');
  await expect(page.locator('#clients-results')).toContainText('No records');
  await query.fill('cam');
  await expect(page.locator('#clients-results')).not.toContainText('No records');
  await expect(page.locator('#clients-results')).toContainText('client@example.invalid');
  await query.press('Enter');
  await expect(page.locator('#clients-results')).toContainText('client@example.invalid');
  await expect(page.locator('#admin-client-name-results')).toBeEmpty();
  await query.fill('');
  await expect(page.locator('#clients-results')).toContainText('Search for a client');
});


test('admin orders update without a page reload and preserve active filters', async ({ page }) => {
  await mockServices(page, 'ADMIN');
  let hasTrade = false;
  const requests = [];
  await page.route('**/admin/trades?*', route => {
    requests.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: pageOf(hasTrade ? [order] : []) });
  });
  await signIn(page);
  await expect(page.locator('#orders-results')).toContainText('No records');
  await page.locator('#orders-form input[name=symbol]').fill('AAPL');
  await page.locator('#orders-form').evaluate(form => form.requestSubmit());
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
  hasTrade = true;
  await expect(page.locator('#orders-results')).toContainText('AAPL', { timeout: 10000 });
  expect(requests.at(-1).get('symbol')).toBe('AAPL');
  await expect(page.locator('#orders-form input[name=symbol]')).toHaveValue('AAPL');
  await page.locator('#logout').click();
  await page.locator('#confirm-logout').click();
  const stopped = requests.length;
  await page.waitForTimeout(3500);
  expect(requests.length).toBe(stopped);
});


test('admin polling retains rows during a failure and recovers automatically', async ({ page }) => {
  await mockServices(page, 'ADMIN');
  let reads = 0;
  await page.route('**/admin/trades?*', route => {
    reads++;
    if (reads === 2) return route.fulfill({ status: 500, json: { detail: 'Temporary test failure' } });
    return route.fulfill({ json: pageOf([{ ...order, status: reads >= 3 ? 'filled' : 'accepted' }]) });
  });
  await signIn(page);
  await expect(page.locator('#orders-results')).toContainText('accepted');
  await expect(page.locator('#orders-live-status')).toContainText('Updates delayed', { timeout: 10000 });
  await expect(page.locator('#orders-results')).toContainText('AAPL');
  await expect(page.locator('#orders-results')).not.toContainText('Could not load');
  await expect(page.locator('#orders-results')).toContainText('filled', { timeout: 10000 });
});


test('suspension lookup distinguishes duplicate names and requires a fresh selection', async ({ page }) => {
  const calls = await mockServices(page, 'ADMIN');
  const otherAccount = '20000000-0000-0000-0000-000000000002';
  await page.route('**/admin/clients/suggestions?*', route => route.fulfill({ json: [
    { clientId: 'first', accountId, fullName: 'Cameron Kelly', email: 'first@example.invalid', suspended: false },
    { clientId: 'second', accountId: otherAccount, fullName: 'Cameron Kelly', email: 'second@example.invalid', suspended: true },
  ] }));
  await signIn(page);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.locator('#action-client-query').fill('ca');
  await expect(page.locator('#action-submit')).toBeDisabled();
  await page.locator('#action-client-results tr').filter({ hasText: 'second@example.invalid' }).getByRole('button').click();
  await expect(page.locator('#action-client-selected')).toContainText('second@example.invalid');
  await expect(page.locator('#action-client-selected')).toContainText('Suspended');
  await page.locator('#action-form select[name=action]').selectOption('unsuspend');
  await page.getByLabel('Reason', { exact: true }).fill('Verified identity');
  await page.locator('#action-submit').click();
  expect(calls.command).toEqual({ path: `/api/v1/admin/accounts/${otherAccount}/unsuspend`, body: { reason: 'Verified identity' } });
  await expect(page.locator('#action-client-selected')).toContainText('Active');
  await page.locator('#action-client-query').fill('car');
  await expect(page.locator('#action-submit')).toBeDisabled();
  await expect(page.locator('#action-form input[name=id]')).toHaveValue('');
  await page.locator('#action-resource').selectOption('instruments');
  await expect(page.getByLabel('Resource ID', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Resource ID', { exact: true })).toHaveValue('');
  await page.locator('#action-resource').selectOption('accounts');
  await expect(page.locator('#action-submit')).toBeDisabled();
  await expect(page.locator('#action-client-query')).toHaveValue('');
});

// All controls share the same label/input baseline even with an empty person lookup.
test('Ultron action controls align and Friday has its own identity', async ({ page }) => {
  await mockServices(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Ultron', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  const tops = await page.locator('#action-resource, #action-client-query, #action-form select[name="action"], #action-form input[name="reason"]').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  await expect(page.locator('#action-id-field')).toBeHidden();
  await page.goto('/analyst');
  await expect(page.getByRole('heading', { name: 'Friday sign in' })).toBeVisible();
});

test('MFA login waits for second factor and lets the user retry a bad code', async ({ page }) => {
  const calls = await mockServices(page, 'ANALYST');
  let attempts = 0;
  await page.route('**/auth/login', route => route.fulfill({ json: { mfaRequired: true, challengeToken: 'opaque-test-challenge' } }));
  await page.route('**/auth/mfa/verify', route => {
    attempts++;
    expect(route.request().postDataJSON().challengeToken).toBe('opaque-test-challenge');
    return attempts === 1
      ? route.fulfill({ status: 401, json: { message: 'Invalid or already used code' } })
      : route.fulfill({ json: { accessToken: token('ANALYST'), refreshToken: 'after-mfa' } });
  });
  await signIn(page, 'ANALYST');
  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  expect(calls.authorized).toHaveLength(0);
  await page.getByLabel('Authenticator or recovery code').fill('000000');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.locator('#message')).toContainText('Invalid or already used code');
  await page.getByLabel('Authenticator or recovery code').fill('123456');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  expect(attempts).toBe(2);
});

test('mandatory staff enrollment shows QR and requires acknowledging recovery codes',async({page})=>{
 await mockServices(page);
 await page.route('**/auth/login',route=>route.fulfill({json:{mfaRequired:true,purpose:'enroll',enrollmentRequired:true,challengeToken:'setup-only',secret:'MANUALTESTKEY',qrDataUrl:'data:image/png;base64,iVBORw0KGgo='}}));
 await page.route('**/auth/mfa/enable',route=>route.fulfill({json:{accessToken:token('ADMIN'),refreshToken:'after-setup',recoveryCodes:['abcdef0123456789']}}));
 await signIn(page);
 await expect(page.locator('#mfa-instructions')).toContainText('Microsoft Authenticator');
 await expect(page.locator('#mfa-secret')).toContainText('MANUALTESTKEY');
 await page.getByLabel('Authenticator or recovery code').fill('123456');await page.getByRole('button',{name:'Verify',exact:true}).click();
 await expect(page.locator('#mfa-recovery')).toContainText('abcdef0123456789');await expect(page.locator('#workspace')).toBeHidden();
 await page.getByRole('button',{name:'I saved my codes'}).click();await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#mfa-recovery')).toBeEmpty();
});

test('staff password reset returns to password plus authenticator login',async({page})=>{
 await mockServices(page,'ANALYST');let resetBody;
 await page.route('**/auth/forgot-password',route=>route.fulfill({json:{message:'If an account exists, a reset code will be sent.',requestToken:'reset-only'}}));
 await page.route('**/auth/verify-reset-code',route=>route.fulfill({json:{resetToken:'verified-reset'}}));
 await page.route('**/auth/reset-password',route=>{resetBody=route.request().postDataJSON();return route.fulfill({json:{success:true,message:'Password updated. Sign in with your new password and authenticator.'}});});
 await page.goto('/analyst.html');await page.getByRole('button',{name:'Forgot password?'}).click();
 await page.locator('#reset-request-form input').fill('priya@example.invalid');await page.getByRole('button',{name:'Send reset code',exact:true}).click();
 await expect(page.getByLabel('New password',{exact:true})).toBeHidden();
 await page.getByLabel('Email reset code').fill('012345');await page.getByRole('button',{name:'Verify email code',exact:true}).click();
 await page.getByLabel('New password',{exact:true}).fill('a-new-test-password');await page.getByLabel('Confirm new password').fill('a-new-test-password');
 await page.getByRole('button',{name:'Update password',exact:true}).click();
 await expect(page.locator('#reset-notice')).toContainText('authenticator');await expect(page.locator('#workspace')).toBeHidden();
 expect(resetBody).toEqual({resetToken:'verified-reset',newPassword:'a-new-test-password'});
 await page.getByRole('button',{name:'Back to sign in',exact:true}).click();await expect(page.locator('#login-form')).toBeVisible();
});

test('admin sees filed disputes and opens related order evidence', async ({ page }) => {
  await mockServices(page);
  await page.route('**/api/v1/admin/disputes?*', route => route.fulfill({ json: [{
    clientName: 'Andrei Zubek', email: 'andrei@example.com', category: 'pricing',
    description: 'The execution price needs investigation. <script>unsafe</script>',
    status: 'submitted', createdAt: now, orderId, side: 'buy', quantity: 2,
    symbol: 'AAPL', orderDate: now,
  }] }));
  await signIn(page);
  await page.getByRole('button', { name: 'Disputes', exact: true }).click();
  await expect(page.locator('#disputes-results')).toContainText('Andrei Zubek');
  await expect(page.locator('#disputes-results')).toContainText('<script>unsafe</script>');
  await page.locator('#disputes-results button').click();
  await expect(page.locator('#order-summary')).toContainText('Cameron Kelly');
  await page.getByRole('button', { name: 'Disputes', exact: true }).click();
  await page.route('**/api/v1/admin/disputes?*', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Refresh disputes' }).click();
  await expect(page.locator('#disputes-results')).toContainText('No disputes have been filed yet.');
});


test('staff tab routes support direct entry, refresh and browser history', async ({ page }) => {
  await mockServices(page);
  await page.goto('/admin/clients');
  await page.getByLabel('Email', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#clients-panel')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/clients$/);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/actions$/);
  await page.goBack();
  await expect(page.locator('#clients-panel')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#actions-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#actions-panel')).toBeVisible();
});


test('logout confirmation can be cancelled or confirmed', async ({ page }) => {
  const calls = await mockServices(page);
  await signIn(page);
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(calls.logout).toBe(0);
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#logout').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(calls.logout).toBe(0);
  await page.locator('#logout').click();
  await page.locator('#confirm-logout').click();
  await expect(page.locator('#login-panel')).toBeVisible();
  expect(calls.logout).toBe(1);
});

// Staff security: SUPER_ADMIN uses the admin page; a new account's first sign-in (D3).
test('super admin signs in to the admin workspace', async ({ page }) => {
  await mockServices(page, 'SUPER_ADMIN');
  await signIn(page, 'ADMIN');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Orders', exact: true })).toBeVisible();
});

test('a new staff account replaces its temporary password before authenticator setup', async ({ page }) => {
  await mockServices(page, 'ANALYST'); let changeBody;
  await page.route('**/auth/login', route => route.fulfill({ json: { passwordChangeRequired: true } }));
  await page.route('**/auth/change-temporary-password', route => { changeBody = route.request().postDataJSON();
    return route.fulfill({ json: { mfaRequired: true, purpose: 'enroll', enrollmentRequired: true, challengeToken: 'setup-only', secret: 'MANUALTESTKEY', qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } }); });
  await signIn(page, 'ANALYST');
  await expect(page.locator('#workspace')).toBeHidden();
  await page.getByLabel('Your new password', { exact: true }).fill('my-own-analyst-password');
  await page.getByLabel('Confirm your new password').fill('my-own-analyst-password');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  await expect(page.locator('#mfa-secret')).toContainText('MANUALTESTKEY');
  expect(changeBody).toEqual({ email: 'staff@example.invalid', password: 'test-only-password', newPassword: 'my-own-analyst-password' });
});

// Iteration 2 T3: every password field is sent exactly as typed, spaces included; other fields are trimmed.
test('passwords keep their spaces, other fields are trimmed', async ({ page }) => {
  await mockServices(page, 'ANALYST'); let loginBody; let changeBody;
  await page.route('**/auth/login', route => { loginBody = route.request().postDataJSON(); return route.fulfill({ json: { passwordChangeRequired: true } }); });
  await page.route('**/auth/change-temporary-password', route => { changeBody = route.request().postDataJSON();
    return route.fulfill({ json: { mfaRequired: true, purpose: 'enroll', enrollmentRequired: true, challengeToken: 'setup-only', secret: 'MANUALTESTKEY', qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } }); });
  await page.goto('/analyst');
  await page.getByLabel('Email', { exact: true }).fill('  staff@example.invalid  ');
  await page.getByLabel('Password', { exact: true }).fill(' temporary password ');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Your new password', { exact: true }).fill('  my own analyst password  ');
  await page.getByLabel('Confirm your new password').fill('  my own analyst password  ');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  await expect(page.locator('#mfa-secret')).toContainText('MANUALTESTKEY');
  expect(loginBody).toEqual({ email: 'staff@example.invalid', password: ' temporary password ' });
  expect(changeBody).toEqual({ email: 'staff@example.invalid', password: ' temporary password ', newPassword: '  my own analyst password  ' });
});

// Iteration 2 T4: the Staff panel (auth-server's /auth/admin/staff routes). The signed-in user's
// token sub is 'staff-test', so the row with that id is "yourself".
const staffRow = (id, role, extra = {}) => ({ id, email: `${role.toLowerCase()}-${id.slice(-2)}@example.invalid`, firstName: 'Test',
  lastName: role, role, disabledAt: null, passwordChangeRequired: false, mfaEnrolled: true, createdAt: now, ...extra });
async function mockStaff(page, accounts) {
  const calls = { list: 0, created: null, changed: [] };
  await page.route('**/auth/admin/staff**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') { calls.list++; return route.fulfill({ json: accounts }); }
    if (/\/(admins|analysts)$/.test(path)) {
      calls.created = { path, body: request.postDataJSON() };
      return route.fulfill({ status: 201, json: { id: '40000000-0000-0000-0000-0000000000aa', email: calls.created.body.email,
        role: path.endsWith('/admins') ? 'ADMIN' : 'ANALYST', temporaryPassword: 'Temp-Pass-shown-once' } });
    }
    const [, id, action] = path.match(/\/auth\/admin\/staff\/([^/]+)\/(disable|enable)$/);
    calls.changed.push(`${action} ${id}`);
    const account = accounts.find(row => row.id === id);
    return route.fulfill({ json: { id, email: account.email, role: account.role, disabledAt: action === 'disable' ? now : null } });
  });
  return calls;
}
const staffRowFor = (page, email) => page.locator('#staff-results tr', { hasText: email });

test('a super admin creates an admin and sees the temporary password only once', async ({ page }) => {
  await mockServices(page, 'SUPER_ADMIN');
  const calls = await mockStaff(page, [staffRow('staff-test', 'SUPER_ADMIN'), staffRow('a0000000-0000-0000-0000-000000000001', 'ADMIN')]);
  await page.goto('/admin/staff');
  await page.getByLabel('Email', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#staff-panel')).toBeVisible();
  await expect(page.locator('#staff-role option')).toHaveText(['Analyst', 'Admin']);
  await page.getByLabel('Role').selectOption('ADMIN');
  await page.getByLabel('Work email').fill('new.admin@example.invalid');
  await page.getByLabel('First name', { exact: true }).fill('Nora');
  await page.getByLabel('Last name', { exact: true }).fill('Admin');
  await page.getByRole('button', { name: 'Create account' }).click();
  // The role is chosen by the route, never sent in the body.
  expect(calls.created).toEqual({ path: '/auth/admin/staff/admins', body: { email: 'new.admin@example.invalid', firstName: 'Nora', lastName: 'Admin' } });
  await expect(page.locator('#staff-password-dialog')).toBeVisible();
  await expect(page.locator('#staff-password-value')).toHaveValue('Temp-Pass-shown-once');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#staff-password-dialog')).toBeHidden();
  await expect(page.locator('#staff-password-value')).toHaveValue('');
  expect(await page.content()).not.toContain('Temp-Pass-shown-once');
  await expect(staffRowFor(page, 'new.admin@example.invalid')).toContainText('Must choose a password');
  // Built from the response: the list was fetched once, when the panel opened.
  expect(calls.list).toBe(1);
  // A super admin can't change themselves, can change admins.
  await expect(staffRowFor(page, 'super_admin-st').getByRole('button')).toHaveCount(0);
  await expect(staffRowFor(page, 'admin-01@').getByRole('button', { name: 'Disable' })).toBeVisible();
});

test('an admin creates analysts only and manages only analysts', async ({ page }) => {
  await mockServices(page, 'ADMIN');
  const calls = await mockStaff(page, [staffRow('staff-test', 'ADMIN'), staffRow('a0000000-0000-0000-0000-000000000002', 'ADMIN'),
    staffRow('s0000000-0000-0000-0000-000000000003', 'SUPER_ADMIN'), staffRow('b0000000-0000-0000-0000-000000000004', 'ANALYST'),
    staffRow('b0000000-0000-0000-0000-000000000005', 'ANALYST', { disabledAt: now })]);
  await signIn(page, 'ADMIN');
  await page.getByRole('button', { name: 'Staff', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(page.locator('#staff-role option')).toHaveText(['Analyst']);
  // Buttons only where the server would allow it: not yourself, not another admin, not a super admin.
  for (const email of ['admin-st@', 'admin-02@', 'super_admin-03@']) await expect(staffRowFor(page, email).getByRole('button')).toHaveCount(0);
  await expect(staffRowFor(page, 'analyst-05@')).toContainText('Disabled');
  page.once('dialog', dialog => dialog.accept());
  await staffRowFor(page, 'analyst-04@').getByRole('button', { name: 'Disable' }).click();
  await expect(staffRowFor(page, 'analyst-04@')).toContainText('Disabled');
  await expect(staffRowFor(page, 'analyst-04@').getByRole('button', { name: 'Enable' })).toBeVisible();
  await staffRowFor(page, 'analyst-05@').getByRole('button', { name: 'Enable' }).click();
  await expect(staffRowFor(page, 'analyst-05@')).toContainText('Active');
  expect(calls.changed).toEqual(['disable b0000000-0000-0000-0000-000000000004', 'enable b0000000-0000-0000-0000-000000000005']);
  await expect(page.locator('#staff-status')).toHaveText('Enabled Test ANALYST.');
  expect(calls.list).toBe(1);
});

test('the Staff panel shows the server refusals and a friendly rate-limit message', async ({ page }) => {
  await mockServices(page, 'ADMIN');
  await mockStaff(page, [staffRow('staff-test', 'ADMIN')]);
  await page.route('**/auth/admin/staff/analysts', route => route.fulfill({ status: 409, json: { title: 'Conflict', status: 409, code: 'CONFLICT', detail: 'email is already registered' } }));
  await signIn(page, 'ADMIN');
  await page.getByRole('button', { name: 'Staff', exact: true }).click();
  await page.getByLabel('Work email').fill('taken@example.invalid');
  await page.getByLabel('First name', { exact: true }).fill('Taken');
  await page.getByLabel('Last name', { exact: true }).fill('Email');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#message')).toHaveText('email is already registered');
  await expect(page.locator('#staff-password-dialog')).toBeHidden();
  await page.route('**/auth/admin/staff', route => route.fulfill({ status: 429, json: { title: 'Too Many Requests', status: 429, code: 'RATE_LIMITED', detail: 'ThrottlerException: Too Many Requests' } }));
  await page.getByRole('button', { name: 'Refresh list' }).click();
  await expect(page.locator('#message')).toHaveText('Too many requests. Wait a few minutes, then try again.');
});

test('the analyst page has no Staff section', async ({ page }) => {
  await mockServices(page, 'ANALYST');
  const calls = await mockStaff(page, []);
  await signIn(page, 'ANALYST');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Staff', exact: true })).toBeHidden();
  await expect(page.locator('#staff-panel')).toBeHidden();
  expect(calls.list).toBe(0);
});
