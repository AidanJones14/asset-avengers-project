import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MfaService,
  type MfaChallenge,
  type MfaPurpose,
} from './mfa.service.js';
import type { User } from '../users/users.repository.js';
import { logAuthEvent } from '../common/log-auth-event.js';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import type pg from 'pg';
import type { Env } from '../config/env.js';
import { UsersRepository } from '../users/users.repository.js';
import { SessionsRepository } from './sessions.repository.js';
import { TokenService } from './token.service.js';
import { requiresMfa } from './access-policy.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// bcrypt work factor: 2^10 rounds, the `$2b$10$` prefix in lecture 12.
export const BCRYPT_COST = 10;

// Compared against when the email doesn't exist, so a login for an unknown
// email takes as long as a wrong password. Otherwise response time reveals which
// emails are registered (a timing attack: this sprint's security focus).
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_COST);

// Credential checks, MFA gating and session flows. The controller only calls these methods; it never sets a
// status code. Throwing a Nest built-in (ConflictException, UnauthorizedException)
// is what produces the HTTP status (lecture 11).
@Injectable()
export class AuthService {
  private readonly idleTimeoutMs: number;
  private readonly maxAgeMs: number;

  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly tokens: TokenService,
    config: ConfigService<Env, true>,
    private readonly mfa: MfaService,
  ) {
    this.idleTimeoutMs =
      config.get('SESSION_IDLE_TIMEOUT_MINUTES', { infer: true }) * 60_000;
    this.maxAgeMs =
      config.get('SESSION_MAX_AGE_HOURS', { infer: true }) * 3_600_000;
  }

  // Lecture 12. Async bcrypt.hash so the ~50-100 ms of hashing doesn't block other
  // requests; the random salt is stored inside the hash itself ($2b$10$<salt><hash>).
  // Returns user.email (the lower-cased stored value), not the argument.
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    mfaEnabled = false,
  ): Promise<{ id: string; email: string; registered: true }> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await this.users.create(
      email,
      passwordHash,
      firstName,
      lastName,
      mfaEnabled,
    );
    if (user === null) {
      throw new ConflictException('email is already registered');
    }
    logAuthEvent('register', user.id);
    return { id: user.id, email: user.email, registered: true };
  }

  // Lecture 12 "bcrypt.compare" + lecture 13 "Part 3".
  // bcrypt.compare always runs, against DUMMY_HASH when the email is unknown, so an
  // unknown email and a wrong password take the same time. Both also get the same
  // message, so neither the timing nor the text reveals which emails are registered.
  // Password proof alone starts a session only for clients who did not opt into MFA.
  private async credentials(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      logAuthEvent('login_failure');
      throw new UnauthorizedException('invalid email or password');
    }
    // Staff security D6: checked only after a correct password, so it reveals nothing to
    // someone who doesn't know it. Covers login, mfa/setup, mfa/replace/start and D3's route.
    if (user.disabledAt) {
      logAuthEvent('login_refused_disabled', user.id);
      throw new ForbiddenException({
        title: 'Forbidden',
        code: 'ACCOUNT_DISABLED',
        detail: 'This account is disabled. Contact an administrator.',
      });
    }

    return user;
  }

  async login(
    email: string,
    password: string,
  ): Promise<MfaChallenge | TokenPair | { passwordChangeRequired: true }> {
    const user = await this.credentials(email, password);
    // 0. Staff security D3: a provisioned account replaces its temporary password first.
    //    No session and no MFA challenge until POST /auth/change-temporary-password.
    if (user.passwordChangeRequired) return { passwordChangeRequired: true };
    // 1. An enrolled authenticator must always be used.
    const enabled = await this.mfa.enabled(user.id);
    // 2. MFA needed -> challenge only: 'login' (enter a code) or 'enroll' (set one up first).
    if (enabled || requiresMfa(user))
      return this.mfa.start(user, enabled ? 'login' : 'enroll');
    // 3. Otherwise a CLIENT who did not opt in: password only, no MFA proof.
    return this.createSession(user, undefined, false);
  }

  async startMfa(
    email: string,
    password: string,
    purpose: 'enroll' | 'replace',
  ) {
    const user = await this.credentials(email, password);
    // D3: no authenticator can be bound to a temporary password (the creating admin knows it).
    if (user.passwordChangeRequired) throw passwordChangeRequired();
    return this.mfa.start(user, purpose);
  }

  // Staff security D3: first login of a provisioned staff account.
  // 1. Re-prove the temporary password (and the disabled check) exactly like login.
  // 2. Set the new password, clear the flag and end any sessions, in one transaction.
  // 3. Continue as login does with the new password: for staff, the MFA enrollment challenge.
  async changeTemporaryPassword(email: string, password: string, newPassword: string) {
    const user = await this.credentials(email, password);
    if (!user.passwordChangeRequired)
      throw new BadRequestException({
        title: 'Bad Request',
        code: 'PASSWORD_CHANGE_NOT_REQUIRED',
        detail: 'This account has no temporary password to replace. Sign in normally.',
      });
    // bcrypt only reads 72 bytes; the DTO counts characters, so check bytes too.
    if (Buffer.byteLength(newPassword, 'utf8') > 72)
      throw new BadRequestException('New password must be at most 72 UTF-8 bytes.');
    if (newPassword === password)
      throw new BadRequestException({
        title: 'Bad Request',
        code: 'PASSWORD_REUSED',
        detail: 'Your new password must be different from your temporary password.',
      });
    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    if (!await this.users.setInitialPassword(user.id, user.passwordHash, hash))
      throw new UnauthorizedException('Credentials changed. Sign in again.');
    logAuthEvent('initial_password_set', user.id);
    return this.login(user.email, newPassword);
  }

  async finishMfa(challengeToken: string, code: string, purpose: MfaPurpose) {
    const result = await this.mfa.complete(
      challengeToken,
      code,
      purpose,
      async (userId, client) => {
        const user = await this.users.findById(userId, client);
        if (!user) throw new UnauthorizedException('Account no longer exists');
        // The only caller passing true: mfa.complete runs this after a valid code.
        return this.createSession(user, client, true);
      },
    );
    if (result.nextChallenge) return result.nextChallenge;
    return {
      ...result.tokens!,
      ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}),
    };
  }

  // mfaVerified has no default: every caller must say whether this login entered a valid code.
  private async createSession(
    user: User,
    client: pg.PoolClient | undefined,
    mfaVerified: boolean,
  ): Promise<TokenPair> {
    const refreshToken = this.tokens.newRefreshToken();
    await this.sessions.create(
      user.id,
      this.tokens.hashRefreshToken(refreshToken),
      this.fromNow(this.idleTimeoutMs),
      this.fromNow(this.maxAgeMs),
      client,
      mfaVerified,
      user.passwordHash,
    );
    logAuthEvent('login_success', user.id);

    return { accessToken: this.tokens.issueAccessToken(user, mfaVerified), refreshToken };
  }

  // Swaps a refresh token for a new pair. Rotation: each refresh token works once,
  // and presenting a used one revokes the whole session (it was stolen, or two tabs raced).
  // Every failure throws the same 401, so the caller can't tell why a token was refused.
  async refresh(refreshToken: string): Promise<TokenPair> {
    // 1. Only the hash is stored, so hash the incoming token and look that up.
    //    Kept in a variable because rotate() needs it again in step 7.
    const oldHash = this.tokens.hashRefreshToken(refreshToken);
    const record = await this.sessions.findByTokenHash(oldHash);

    // 2. Unknown token: never issued, or made up.
    //    Every failure below uses this same message, so the caller can't tell why it was refused.
    if (!record)
      throw new UnauthorizedException('invalid or expired refresh token');

    // 3. Already exchanged once: someone is replaying it. Kill the whole session,
    //    so neither the attacker nor the real user can keep using it.
    if (record.usedAt) {
      await this.sessions.revoke(record.session.id);
      logAuthEvent('refresh_reuse_detected', record.session.userId);
      throw new UnauthorizedException('invalid or expired refresh token');
    }

    // 4. Session logged out, idle too long, or past its 12-hour limit.
    //    Date vs Date compares the underlying timestamps.
    const now = new Date();
    if (
      record.session.revokedAt ||
      now > record.session.idleExpiresAt ||
      now > record.session.absoluteExpiresAt
    ) {
      throw new UnauthorizedException('invalid or expired refresh token');
    }

    // 5. The session only stores userId; the access token also needs email and roles.
    //    Reading the user fresh means a role change shows up in this new token.
    const user = await this.users.findById(record.session.userId);
    // Deleted, disabled (D6) or still on a temporary password (D3) since login.
    if (!user || user.disabledAt || user.passwordChangeRequired)
      throw new UnauthorizedException('invalid or expired refresh token');

    // A password-only session cannot become MFA-authenticated through refresh, and stops
    // refreshing once the account needs MFA (checked against the user's current state).
    if (!record.session.mfaVerifiedAt &&
        (requiresMfa(user) || await this.mfa.enabled(user.id)))
      throw new UnauthorizedException('Authenticator verification is required');

    // 6. The replacement refresh token. Nothing is saved yet.
    const next = this.tokens.newRefreshToken();

    // 7. New idle deadline: 30 minutes from now, but never past the absolute limit.
    const idle = this.fromNow(this.idleTimeoutMs);
    const idleExpiresAt =
      idle < record.session.absoluteExpiresAt
        ? idle
        : record.session.absoluteExpiresAt;

    //    One transaction: mark the old token used, store hash(next), move the idle deadline.
    //    false = another request used this same token a moment ago, so treat it like step 3.
    const rotated = await this.sessions.rotate(
      record.session.id,
      oldHash,
      this.tokens.hashRefreshToken(next),
      idleExpiresAt,
    );
    if (!rotated) {
      await this.sessions.revoke(record.session.id);
      logAuthEvent('refresh_reuse_detected', record.session.userId);
      throw new UnauthorizedException('invalid or expired refresh token');
    }

    // 8. Same shape as login, but with the new refresh token. The old one is now dead.
    logAuthEvent('refresh', user.id);
    return {
      accessToken: this.tokens.issueAccessToken(user, !!record.session.mfaVerifiedAt),
      refreshToken: next,
    };
  }

  // Lecture 11 lab. Revokes the session this refresh token belongs to.
  // Always answers { loggedOut: true }: logging out twice isn't an error, and the
  // answer shouldn't reveal whether a token was valid.
  // Access tokens already issued stay valid until they expire (at most ACCESS_TOKEN_TTL),
  // because Spring checks them without asking this service.
  async logout(refreshToken: string): Promise<{ loggedOut: true }> {
    const oldHash = this.tokens.hashRefreshToken(refreshToken);
    const record = await this.sessions.findByTokenHash(oldHash);

    if (record) {
      await this.sessions.revoke(record.session.id);
      logAuthEvent('logout', record.session.userId);
    }

    return { loggedOut: true };
  }

  private fromNow(ms: number): Date {
    return new Date(Date.now() + ms);
  }
}

// D3: the error mfa/setup and mfa/replace/start give a flagged account.
function passwordChangeRequired() {
  return new ForbiddenException({
    title: 'Forbidden',
    code: 'PASSWORD_CHANGE_REQUIRED',
    detail: 'Choose a new password before setting up your authenticator.',
  });
}
