import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { User } from '../users/users.repository.js';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type { StringValue } from 'ms';

// The claims inside every access token. Spring reads `sub` as the client id
// and `roles` as authorities (SecurityConfig: roles claim, "ROLE_" prefix).
export interface AccessTokenClaims {
  sub: string; // user UUID, never the email
  email: string;
  roles: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

// Everything to do with creating and checking tokens. Kept separate from
// AuthService so it can be unit tested on its own with a known secret.
@Injectable()
export class TokenService {
  // A plain string secret: jsonwebtoken signs with its UTF-8 bytes, which is
  // exactly what Spring's sharedSecret.getBytes(UTF_8) produces.
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTokenTtl: string;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get('JWT_SECRET', { infer: true });
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.audience = config.get('JWT_AUDIENCE', { infer: true });
    this.accessTokenTtl = config.get('ACCESS_TOKEN_TTL', { infer: true });
  }

  // Signs a short-lived access token (lecture 13, "Part 3: Wired Into the Auth Service").
  // The options become claims: subject -> sub, issuer -> iss, audience -> aud,
  // expiresIn -> exp. jsonwebtoken adds iat itself.
  // `as StringValue`: jsonwebtoken only accepts duration strings like '15m', and
  // ACCESS_TOKEN_TTL is a plain string in env.ts. The cast only tells the compiler; it
  // does nothing at runtime.
  issueAccessToken(user: Pick<User, 'id' | 'email' | 'roles'>): string {
    return jwt.sign({ email: user.email, roles: user.roles }, this.secret, {
      algorithm: 'HS256',
      expiresIn: this.accessTokenTtl as StringValue,
      subject: user.id,
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  // Verifies a token and returns its claims (lecture 13 lab, validateToken). Spring does
  // the real validation in production; this exists so tests can prove the signature and
  // claims are right (lecture 14, test 2).
  // `algorithms` is required: without it, a token claiming "alg": "none" could pass unsigned.
  // Errors propagate (TokenExpiredError vs JsonWebTokenError) instead of becoming null.
  validateAccessToken(token: string): AccessTokenClaims {
    // verify() is typed as returning string | JwtPayload. `as AccessTokenClaims` only tells the
    // compiler which shape to expect; nothing is converted or checked at runtime.
    return jwt.verify(token, this.secret, {
      algorithms: ['HS256'],
      issuer: this.issuer,
      audience: this.audience,
    }) as AccessTokenClaims;
  }

  // A new opaque refresh token (lecture 13, "One Deliberate Asymmetry"): 256 random bits
  // as URL-safe text. Not a JWT, because it is only ever checked against the database.
  newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  // What gets stored instead of the token itself: sha256 as a Buffer, which pg writes to
  // the bytea column. SHA-256 (not bcrypt) is right here: the token is already 256 random
  // bits, so there is nothing to brute-force, and lookups must be fast and deterministic.
  hashRefreshToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }
}
