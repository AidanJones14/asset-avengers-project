import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import type { Env } from '../config/env.js';
import { UsersRepository } from '../users/users.repository.js';
import { SessionsRepository } from './sessions.repository.js';
import { TokenService } from './token.service.js';

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

// The four auth flows. The controller only calls these methods; it never sets a
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
  ) {
    this.idleTimeoutMs =
      config.get('SESSION_IDLE_TIMEOUT_MINUTES', { infer: true }) * 60_000;
    this.maxAgeMs =
      config.get('SESSION_MAX_AGE_HOURS', { infer: true }) * 3_600_000;
  }

  // TODO(you): lecture 12, "Part 2: Real Password Hashing with bcrypt".
  //   1. const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  //   2. const user = await this.users.create(email, passwordHash)
  //   3. user === null means the email is taken: throw new ConflictException('email is already registered')
  //   4. logAuthEvent('register', user.id)   (from ../common/log-auth-event.js)
  //   5. return { id: user.id, email: user.email, registered: true }
  async register(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string; registered: true }> {
    throw new NotImplementedException('AuthService.register');
  }

  // TODO(you): lecture 12 "bcrypt.compare" + lecture 13 "Part 3".
  //   1. const user = await this.users.findByEmail(email)
  //   2. const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  //      (always run compare, even for an unknown email; see DUMMY_HASH above)
  //   3. if (!user || !ok): logAuthEvent('login_failure') and
  //      throw new UnauthorizedException('invalid email or password')
  //      (one message for both cases, so it never reveals which part was wrong)
  //   4. const refreshToken = this.tokens.newRefreshToken()
  //   5. await this.sessions.create(user.id, this.tokens.hashRefreshToken(refreshToken),
  //        this.fromNow(this.idleTimeoutMs), this.fromNow(this.maxAgeMs))
  //   6. logAuthEvent('login_success', user.id)
  //   7. return { accessToken: this.tokens.issueAccessToken(user), refreshToken }
  async login(email: string, password: string): Promise<TokenPair> {
    void DUMMY_HASH; // remove once login uses it
    throw new NotImplementedException('AuthService.login');
  }

  // TODO(you): swap a refresh token for a new pair. Rotation: each refresh token works once.
  //   1. const record = await this.sessions.findByTokenHash(this.tokens.hashRefreshToken(refreshToken))
  //   2. if (!record): throw new UnauthorizedException('invalid or expired refresh token')
  //   3. if (record.usedAt): a token was replayed (stolen, or two tabs raced).
  //      await this.sessions.revoke(record.session.id); logAuthEvent('refresh_reuse_detected', record.session.userId);
  //      then throw the same UnauthorizedException
  //   4. if the session is revoked, or idleExpiresAt / absoluteExpiresAt is in the past: throw it too
  //   5. const user = await this.users.findById(record.session.userId)
  //      (re-read, so a role change applies on the next refresh)
  //   6. const next = this.tokens.newRefreshToken()
  //   7. const rotated = await this.sessions.rotate(record.session.id, <old hash>, <hash of next>,
  //        earliest of fromNow(idleTimeoutMs) and absoluteExpiresAt)
  //      if (!rotated): another request just used this token; treat it like step 3
  //   8. logAuthEvent('refresh', user.id) and return { accessToken: this.tokens.issueAccessToken(user), refreshToken: next }
  async refresh(refreshToken: string): Promise<TokenPair> {
    throw new NotImplementedException('AuthService.refresh');
  }

  // TODO(you): lecture 11 lab, logout.
  //   1. look the token up as in refresh step 1
  //   2. if found: await this.sessions.revoke(record.session.id); logAuthEvent('logout', record.session.userId)
  //   3. return { loggedOut: true } whether or not it was found. Logging out twice isn't an error,
  //      and the answer shouldn't reveal whether a token was valid.
  //   Access tokens already issued stay valid until they expire (at most ACCESS_TOKEN_TTL).
  async logout(refreshToken: string): Promise<{ loggedOut: true }> {
    throw new NotImplementedException('AuthService.logout');
  }

  private fromNow(ms: number): Date {
    return new Date(Date.now() + ms);
  }
}
