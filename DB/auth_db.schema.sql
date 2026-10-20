-- Auth DB schema (credentials and sessions), owned by auth-server.
-- Docker runs this once, when the auth-db volume is first created.
-- Safe to re-run by hand: everything uses IF NOT EXISTS.
-- The shared auth service serves client and staff; neither Java API reads this DB.
-- JWT sub/roles connect identity across services. See DB/README.md for the full map.

-- Credentials and identity. `id` becomes the JWT's `sub`; the trading DB's users.user_id uses the same value.
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,          -- stored lower-case (UsersRepository)
  first_name    varchar(100),
  last_name     varchar(100),
  password_hash text        NOT NULL,                 -- bcrypt, never the password
  roles         text[]      NOT NULL DEFAULT '{CLIENT}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per login. A user can have several at once (phone + laptop).
CREATE TABLE IF NOT EXISTS sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,   -- pushed forward on every refresh
  absolute_expires_at timestamptz NOT NULL,   -- never moves
  revoked_at          timestamptz             -- set by logout or replay detection
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

-- Every refresh token a session has been issued. Only the newest is unused;
-- presenting a used one means replay, and the whole session is revoked.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash bytea       PRIMARY KEY,         -- sha256(token), never the token
  session_id uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS refresh_tokens_session_id_idx ON refresh_tokens (session_id);

-- Existing identities keep their UUID, credentials and sessions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(100);

-- Client signup opts into MFA; staff policy and enabled authenticators still require it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;

-- MFA credentials stay in auth DB only. Never replicate these tables to reporting.
-- AES-GCM ciphertext includes a fresh IV and authentication tag; the key is external.
CREATE TABLE IF NOT EXISTS user_mfa (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext text,
  enabled_at timestamptz,
  last_time_step bigint NOT NULL DEFAULT -1,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
CREATE TABLE IF NOT EXISTS mfa_challenges (
  token_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('login', 'enroll', 'disable')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS mfa_challenges_user_idx ON mfa_challenges(user_id);
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL,
  used_at timestamptz,
  PRIMARY KEY(user_id, code_hash)
);

-- Mandatory MFA rollout: historical password-only sessions cannot refresh.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
-- Only revoke password-only sessions when the identity requires a second factor.
UPDATE sessions s SET revoked_at=now() FROM users u
WHERE s.user_id=u.id AND s.mfa_verified_at IS NULL AND s.revoked_at IS NULL
AND (u.mfa_required OR u.roles && ARRAY['ADMIN','ANALYST']::text[]
     OR EXISTS (SELECT 1 FROM user_mfa m WHERE m.user_id=u.id AND m.enabled_at IS NOT NULL));
ALTER TABLE mfa_challenges ADD COLUMN IF NOT EXISTS pending_secret_ciphertext text;
ALTER TABLE mfa_challenges DROP CONSTRAINT IF EXISTS mfa_challenges_purpose_check;
ALTER TABLE mfa_challenges ADD CONSTRAINT mfa_challenges_purpose_check
  CHECK (purpose IN ('login','enroll','disable','replace','replace-enroll'));
CREATE INDEX IF NOT EXISTS mfa_challenges_expiry_idx ON mfa_challenges(expires_at);

-- Password resets never modify user_mfa. Codes are HMAC protected because a
-- six-digit code alone has too little entropy to hash safely against a DB leak.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_requests(user_id,created_at);
CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_requests(expires_at);
-- Auth-only durable delivery queue. Encrypted codes are erased after send/expiry.
CREATE TABLE IF NOT EXISTS auth_email_outbox (
  reset_id uuid PRIMARY KEY REFERENCES password_reset_requests(id) ON DELETE CASCADE,
  payload_ciphertext text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error_code text
);
CREATE INDEX IF NOT EXISTS auth_email_due_idx ON auth_email_outbox(next_attempt_at)
 WHERE sent_at IS NULL AND failed_at IS NULL;

-- Verify the email code before exposing the password step. The resulting grant
-- is hashed, short-lived, single-use, and has no application API authority.
ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS reset_grant_hash bytea;
ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS reset_grant_expires_at timestamptz;
ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS email_hash bytea;
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_grant_idx ON password_reset_requests(reset_grant_hash)
 WHERE reset_grant_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS password_reset_email_idx ON password_reset_requests(email_hash,created_at);
