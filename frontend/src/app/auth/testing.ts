// Helpers for specs only (imported from *.spec.ts files, so never part of the app bundle).

/** An access token whose payload the app can read. Signatures are never checked in the browser. */
export function fakeAccessToken(roles: string[], email = 'frank.client@example.com'): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = { sub: '00000000-0000-0000-0000-000000000006', email, roles, iat: now, exp: now + 900 };
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}
