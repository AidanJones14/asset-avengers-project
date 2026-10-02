import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { User } from '../users/users.repository.js';

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

  // TODO(you): sign a short-lived access token. Lecture 13, "Part 3: Wired Into the Auth Service".
  //   1. import jwt from 'jsonwebtoken'
  //   2. return jwt.sign(
  //        { email: user.email, roles: user.roles },
  //        this.secret,
  //        { algorithm: 'HS256', expiresIn: this.accessTokenTtl, subject: user.id,
  //          issuer: this.issuer, audience: this.audience })
  //   Docs: https://github.com/auth0/node-jsonwebtoken#jwtsignpayload-secretorprivatekey-options-callback
  //   (look at the `subject`, `issuer`, `audience` and `expiresIn` options)
  issueAccessToken(user: Pick<User, 'id' | 'email' | 'roles'>): string {
    throw new NotImplementedException('TokenService.issueAccessToken');
  }

  // TODO(you): verify a token and return its claims. Lecture 13 lab, validateToken.
  //   jwt.verify(token, this.secret, { algorithms: ['HS256'], issuer: this.issuer, audience: this.audience })
  //   Let the errors propagate (TokenExpiredError vs JsonWebTokenError); don't
  //   swallow them into null. Spring does the real validation in production;
  //   this exists so tests can prove the signature and claims are right (lecture 14, test 2).
  //   Always pass `algorithms`, so a token claiming "alg": "none" is rejected.
  validateAccessToken(token: string): AccessTokenClaims {
    throw new NotImplementedException('TokenService.validateAccessToken');
  }

  // TODO(you): a new opaque refresh token. Lecture 13, "One Deliberate Asymmetry".
  //   import { randomBytes } from 'node:crypto'
  //   return randomBytes(32).toString('base64url')   // 256 random bits, URL-safe text
  newRefreshToken(): string {
    throw new NotImplementedException('TokenService.newRefreshToken');
  }

  // TODO(you): what gets stored instead of the token itself.
  //   import { createHash } from 'node:crypto'
  //   return createHash('sha256').update(token).digest()   // a Buffer -> bytea column
  //   SHA-256 (not bcrypt) is right here: the token is already 256 random bits,
  //   so there is nothing to brute-force, and lookups must be fast and deterministic.
  hashRefreshToken(token: string): Buffer {
    throw new NotImplementedException('TokenService.hashRefreshToken');
  }
}
