import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { TEST_ENV } from '../../test/test-env.js';
import type { Env } from '../config/env.js';
import { TokenService } from './token.service.js';

// Unit tests for TokenService's MFA rules (staff-security plan, section 2 "rule R" and section 3.1).
// No database and no Nest app: a real TokenService built from the fixed test settings,
// so every token here is signed and verified exactly as in production.
//
// Two things are checked:
//   A. What auth-server WRITES into a token: the `mfa_required` claim must be true for every
//      account that isn't a plain CLIENT, so Spring and auth-server agree the account needs MFA.
//   B. What auth-server ACCEPTS from a token: validateAccessToken is auth-server's only verifier
//      (ProfileController uses it today), and it must refuse any token without the MFA proof the
//      account needs, using the same allow-list rule as the trading backend's decoder:
//        - `amr` must contain "pwd"
//        - `amr` must also contain "mfa", UNLESS roles are exactly ["CLIENT"] and mfa_required is false

const tokens = new TokenService(
  new ConfigService<Env, true>({ ...TEST_ENV, ACCESS_TOKEN_TTL: '15m' }),
);

// A user the way UsersRepository returns one. Nobody here has opted into MFA (mfaRequired false),
// so any MFA requirement in these tests can only come from the role.
function account(roles: string[], mfaRequired = false) {
  return {
    id: randomUUID(),
    email: 'person@example.com',
    roles,
    mfaRequired,
    firstName: 'Test',
    lastName: 'Person',
  };
}

// Signs a token with arbitrary claims but the REAL secret, issuer and audience. Used to build
// tokens that auth-server's issueAccessToken would never produce today (e.g. no `amr`, or two
// roles), because a verifier must also refuse tokens minted by older code or by a mistake.
function signed(claims: Record<string, unknown>): string {
  return jwt.sign({ email: 'person@example.com', ...claims }, TEST_ENV.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    subject: randomUUID(),
    issuer: TEST_ENV.JWT_ISSUER,
    audience: TEST_ENV.AUTH_JWT_AUDIENCE,
  });
}

describe('TokenService: the mfa_required claim it writes', () => {
  // 1. Every staff role needs MFA. SUPER_ADMIN is the case dev got wrong: the old role list only
  //    named ADMIN and ANALYST, so a SUPER_ADMIN's token said mfa_required: false.
  //    jwt.decode (no verification) is used so this test only looks at what was written.
  it.each(['ANALYST', 'ADMIN', 'SUPER_ADMIN'])(
    'a %s token says mfa_required: true even before MFA is verified',
    (role) => {
      const token = tokens.issueAccessToken(account([role]), false);
      expect(jwt.decode(token)).toMatchObject({ amr: ['pwd'], mfa_required: true });
    },
  );

  // 2. Control: a CLIENT who did not opt in really is MFA-optional, so the flag stays false.
  //    Without this, a policy that marked EVERYONE as MFA-required would also pass test 1.
  it('a CLIENT who did not opt in gets mfa_required: false', () => {
    const token = tokens.issueAccessToken(account(['CLIENT']), false);
    expect(jwt.decode(token)).toMatchObject({ amr: ['pwd'], mfa_required: false });
  });
});

describe('TokenService.validateAccessToken: refuses tokens without the MFA proof the account needs', () => {
  // 3. Each row is a token signed with the real secret that must still be refused.
  //    JsonWebTokenError is jsonwebtoken's own "this token is not acceptable" error, the same
  //    family verify() throws for a bad signature or wrong audience, so callers treat it alike.
  it.each([
    ['a password-only SUPER_ADMIN (what dev issues for one)', { roles: ['SUPER_ADMIN'], amr: ['pwd'], mfa_required: false }],
    ['a password-only token claiming CLIENT and SUPER_ADMIN', { roles: ['CLIENT', 'SUPER_ADMIN'], amr: ['pwd'], mfa_required: false }],
    ['a password-only ADMIN', { roles: ['ADMIN'], amr: ['pwd'], mfa_required: false }],
    ['a password-only CLIENT who opted into MFA', { roles: ['CLIENT'], amr: ['pwd'], mfa_required: true }],
    ['a password-only CLIENT whose token has no mfa_required claim', { roles: ['CLIENT'], amr: ['pwd'] }],
    ['a token with no amr at all (minted before MFA existed)', { roles: ['CLIENT'], mfa_required: false }],
    ['a token whose amr is empty', { roles: ['CLIENT'], amr: [], mfa_required: false }],
    ['a token claiming mfa without pwd', { roles: ['CLIENT'], amr: ['mfa'], mfa_required: false }],
  ])('refuses %s', (_label, claims) => {
    expect(() => tokens.validateAccessToken(signed(claims))).toThrow(jwt.JsonWebTokenError);
  });

  // 4. Controls: the tokens the system legitimately issues must still be accepted, otherwise
  //    test 3 would also pass for a verifier that rejects everything.
  it.each([
    ['a password-only CLIENT who did not opt in', { roles: ['CLIENT'], amr: ['pwd'], mfa_required: false }],
    ['a CLIENT with MFA', { roles: ['CLIENT'], amr: ['pwd', 'mfa'], mfa_required: true }],
    ['an ADMIN with MFA', { roles: ['ADMIN'], amr: ['pwd', 'mfa'], mfa_required: true }],
    ['a SUPER_ADMIN with MFA', { roles: ['SUPER_ADMIN'], amr: ['pwd', 'mfa'], mfa_required: true }],
  ])('accepts %s', (_label, claims) => {
    expect(tokens.validateAccessToken(signed(claims))).toMatchObject(claims);
  });

  // 5. The round trip through auth-server's own issuer: a password-only token it issues for a
  //    SUPER_ADMIN (e.g. by a future bug) must not be usable at auth-server itself.
  it('refuses the password-only token issueAccessToken makes for a SUPER_ADMIN', () => {
    const token = tokens.issueAccessToken(account(['SUPER_ADMIN']), false);
    expect(() => tokens.validateAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });
});

// Staff-security plan D1: one audience per verifier. Each service accepts only tokens naming it.
describe('TokenService: audiences', () => {
  // 1. Issuing: clients get the trading API + auth-server; staff also get the staff service.
  it('a CLIENT token is for the trading API and auth-server only', () => {
    const token = tokens.issueAccessToken(account(['CLIENT']), false);
    expect(jwt.decode(token)).toMatchObject({ aud: ['endgame-api', 'endgame-auth'] });
  });
  it.each(['ANALYST', 'ADMIN', 'SUPER_ADMIN'])('a %s token is also for the staff service', (role) => {
    const token = tokens.issueAccessToken(account([role]), true);
    expect(jwt.decode(token)).toMatchObject({ aud: ['endgame-api', 'endgame-auth', 'endgame-staff'] });
  });

  // 2. Verifying: auth-server refuses a genuine token that doesn't name it.
  it.each([['endgame-api'], ['endgame-staff'], ['someone-else']])('refuses a token whose aud is only %s', (aud) => {
    const token = jwt.sign({ roles: ['CLIENT'], amr: ['pwd'], mfa_required: false }, TEST_ENV.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '5m', subject: randomUUID(), issuer: TEST_ENV.JWT_ISSUER, audience: aud,
    });
    expect(() => tokens.validateAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });
  it('accepts its own issued staff token', () => {
    const token = tokens.issueAccessToken(account(['SUPER_ADMIN']), true);
    expect(tokens.validateAccessToken(token).roles).toEqual(['SUPER_ADMIN']);
  });
});
