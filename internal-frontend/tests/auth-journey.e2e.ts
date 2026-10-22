import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

// RFC 6238 TOTP generated from the enrollment secret displayed by the actual UI.
// This is not a bypass: the real auth service checks the code and rejects replays.
function totp(secret: string, step: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error('Unexpected enrollment key format');
    bits += value.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function submitCode(page: Page, secret: string, previousStep = -1) {
  // A code already consumed at enrollment cannot be reused after logout.
  if (Math.floor(Date.now() / 30_000) <= previousStep) {
    await new Promise(resolve => setTimeout(resolve, (previousStep + 1) * 30_000 - Date.now() + 300));
  }
  const step = Math.floor(Date.now() / 30_000);
  await page.getByLabel('Authenticator or recovery code').fill(totp(secret, step));
  await page.locator('#mfa-form').getByRole('button', { name: 'Verify', exact: true }).click();
  return step;
}

async function passwordLogin(page: Page, route: string, email: string, password = process.env.TEST_LOGIN_PASSWORD!) {
  await page.goto(route);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function logout(page: Page) {
  await page.locator('#logout').click();
  await page.locator('#confirm-logout').click();
  await expect(page.locator('#login-form')).toBeVisible();
}

test.afterEach(async ({ context }, info) => {
  if (info.status !== info.expectedStatus) {
    for (const [index, page] of context.pages().entries()) {
      // Never save QR codes, recovery codes or filled credentials to artifacts.
      await page.screenshot({ path: info.outputPath(`failure-${index}.png`),
        mask: [page.locator('input, #mfa-secret, #mfa-recovery, .mfa-qr')],
      }).catch(() => {});
      await page.evaluate(() => {
        document.querySelectorAll('#mfa-secret, #mfa-recovery').forEach(node => { node.textContent = '[redacted]'; });
        document.querySelectorAll<HTMLInputElement>('input').forEach(node => { node.value = ''; });
        document.querySelectorAll('.mfa-qr').forEach(node => node.remove());
      }).catch(() => {});
    }
  }
});

test('real staff passwords, fresh MFA enrollment, logout, and analyst Superset SSO', async ({ page }) => {
  for (const [role, route, email] of [
    ['ADMIN', '/admin', process.env.TEST_ADMIN_EMAIL!],
    ['ANALYST', '/analyst', process.env.TEST_ANALYST_EMAIL!],
  ]) {
    if (role === 'ADMIN') {
      await passwordLogin(page, route, email, 'deliberately-incorrect-test-password');
      await expect(page.locator('#message')).toBeVisible();
      await expect(page.locator('#mfa-form')).toHaveCount(0);
    }
    await passwordLogin(page, route, email);
    await expect(page.getByRole('heading', { name: 'Set up your authenticator' })).toBeVisible();
    await expect(page.locator('.mfa-qr')).toBeVisible();
    const secret = (await page.locator('#mfa-secret').innerText()).replace('Manual setup key:', '').trim();
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    let step = await submitCode(page, secret);
    await expect(page.getByRole('heading', { name: 'Save these recovery codes' })).toBeVisible();
    await page.getByRole('button', { name: 'I saved my codes' }).click();
    await expect(page.locator('#identity')).toContainText(role === 'ADMIN' ? 'Browser Admin' : 'Browser Analyst');
    await expect(page.locator('#identity')).toContainText(role);
    if (role === 'ADMIN') {
      await expect(page.getByRole('button', { name: 'Orders', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Orders', exact: true })).toBeHidden();
      await expect(page.locator('#superset-workspace')).toBeVisible();
      const opened = page.waitForEvent('popup');
      await page.locator('#superset-workspace').click();
      const superset = await opened;
      await expect(superset).toHaveURL(/\/sqllab\//, { timeout: 60_000 });
      const identity = await superset.request.get('http://superset:8088/api/v1/me/');
      expect(identity.status()).toBe(200);
      expect((await identity.json()).result.email).toBe(email);
      await logout(page);
      await superset.goto('http://superset:8088/sqllab/');
      await expect(superset).toHaveURL(/\/endgame\/sso-required/);
      await superset.close();
    }
    if (role === 'ADMIN') await logout(page);
    await passwordLogin(page, route, email);
    await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
    await expect(page.locator('#mfa-secret')).toHaveCount(0);
    // Deliberately reject a code outside the current +/- 2 windows.
    const current = Math.floor(Date.now() / 30_000);
    const valid = new Set([-2, -1, 0, 1, 2].map(delta => totp(secret, current + delta)));
    let wrong = 0;
    while (valid.has(wrong.toString().padStart(6, '0'))) wrong++;
    await page.getByLabel('Authenticator or recovery code').fill(wrong.toString().padStart(6, '0'));
    await page.locator('#mfa-form').getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.locator('#message')).toBeVisible();
    await expect(page.locator('#mfa-form')).toBeVisible();
    step = await submitCode(page, secret, step);
    await expect(page.locator('#identity')).toBeVisible();
    await logout(page);
  }
});
