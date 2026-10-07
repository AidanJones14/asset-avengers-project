-- Up Migration

-- Credentials and identity. `id` becomes the JWT's `sub`; Spring's clients.id uses the same value.
-- TODO: add PII columns (name, date of birth, ...) here as the product needs them.
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,          -- stored lower-case (UsersRepository)
  password_hash text        NOT NULL,                 -- bcrypt, never the password
  roles         text[]      NOT NULL DEFAULT '{CLIENT}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per login. A user can have several at once (phone + laptop).
CREATE TABLE sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,   -- pushed forward on every refresh
  absolute_expires_at timestamptz NOT NULL,   -- never moves
  revoked_at          timestamptz             -- set by logout or replay detection
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Every refresh token a session has been issued. Only the newest is unused;
-- presenting a used one means replay, and the whole session is revoked.
CREATE TABLE refresh_tokens (
  token_hash bytea       PRIMARY KEY,         -- sha256(token), never the token
  session_id uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz
);
CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens (session_id);

-- Down Migration

DROP TABLE refresh_tokens;
DROP TABLE sessions;
DROP TABLE users;
