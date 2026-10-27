-- Demo logins for local and Jenkins environments only. Never load this into a real environment.
-- Seeded staff must enroll their own authenticator on first login.
-- New seeded clients default to optional MFA; existing enrollments and opt-ins are preserved.
-- No shared MFA secrets or password-reset codes are seeded.
-- Every account's password is: EndgameDemo123! (the one bcrypt hash below).
-- These are development login fixtures, not funded trading portfolios.
-- Endgame creates each matching user/account on first authenticated use, with zero cash.
-- No bank accounts, holdings, orders or watchlist stars are seeded.
-- Registration only ever creates CLIENTs. Seeded ADMIN/ANALYST logins are shared demo accounts;
-- new staff accounts come from the SUPER_ADMIN below through the staff routes.
--
-- Each account is listed once. A new volume gets it inserted; an older volume keeps its row and only
-- gets missing names filled in. Existing passwords, roles and flags are never changed here.
WITH demo_password(hash) AS (
  VALUES ('$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2')
), demo(id, email, roles, first_name, last_name, password_change_required) AS (VALUES
  -- Shared demo staff: the docs, the demo audit events and load-demo-data.sh use these two.
  ('00000000-0000-0000-0000-000000000001'::uuid, 'david.admin@example.com',    '{ADMIN}'::text[], 'David',   'Admin',      false),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'priya.analyst@example.com',  '{ANALYST}',       'Priya',   'Analyst',    false),
  ('00000000-0000-0000-0000-000000000006'::uuid, 'frank.client@example.com',   '{CLIENT}',        'Frank',   'Client',     false),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'grace.client@example.com',   '{CLIENT}',        'Grace',   'Client',     false),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'henry.client@example.com',   '{CLIENT}',        'Henry',   'Client',     false),
  -- Staff security D2/D3: the one SUPER_ADMIN, who creates admins through POST /auth/admin/staff/admins.
  -- It must replace the demo password at first login, then enroll an authenticator. It is the only
  -- super admin that can sign in when DEV_MFA_BYPASS is off. (…0009 is the fake staff `sub` the
  -- test scripts mint, so this uses …0010.)
  ('00000000-0000-0000-0000-000000000010'::uuid, 'super.admin@example.com',    '{SUPER_ADMIN}',   'Super',   'Admin',      true),
  -- TEMPORARY dev accounts for DEV_MFA_BYPASS (auth-server/src/auth/dev-mfa-bypass.ts); remove these
  -- three rows and the user_mfa statement below with it.
  ('00000000-0000-0000-0000-000000000011'::uuid, 'dev.superadmin@example.com', '{SUPER_ADMIN}',   'Dev',     'SuperAdmin', false),
  ('00000000-0000-0000-0000-000000000012'::uuid, 'dev.admin@example.com',      '{ADMIN}',         'Dev',     'Admin',      false),
  ('00000000-0000-0000-0000-000000000013'::uuid, 'dev.analyst@example.com',    '{ANALYST}',       'Dev',     'Analyst',    false)
), inserted AS (
  INSERT INTO users (id, email, password_hash, roles, first_name, last_name, password_change_required)
  SELECT d.id, d.email, p.hash, d.roles, d.first_name, d.last_name, d.password_change_required
  FROM demo d CROSS JOIN demo_password p
  ON CONFLICT DO NOTHING
)
-- Older volumes: fixture names are auth-owned; never infer names for real users from their email.
UPDATE users SET first_name = d.first_name, last_name = d.last_name
FROM demo d
WHERE users.id = d.id AND users.first_name IS NULL AND users.last_name IS NULL;

-- The dev accounts' user_mfa row is marked enrolled, so the session check accepts the switch's
-- MFA-verified session, but has no secret and is locked until 9999: no code, setup or replacement
-- can succeed. Switch on: they sign in with the password alone. Switch off: they can't sign in at all.
-- (Not 'infinity': node-postgres reads it as Infinity, an invalid Date, and the lock check misses it.)
INSERT INTO user_mfa (user_id, secret_ciphertext, enabled_at, locked_until)
SELECT id, NULL, now(), '9999-12-31 00:00:00+00' FROM users
 WHERE id IN ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013')
ON CONFLICT (user_id) DO NOTHING;

-- Rename the dedicated development identities on existing volumes without resetting credentials.
UPDATE users SET email='david.admin@example.com',first_name='David',last_name='Admin'
 WHERE id='00000000-0000-0000-0000-000000000001' AND email IN ('alice.admin@example.com','david.admin@example.com');
UPDATE users SET email='priya.analyst@example.com',first_name='Priya',last_name='Analyst'
 WHERE id='00000000-0000-0000-0000-000000000003' AND email IN ('charlie.analyst@example.com','priya.analyst@example.com');
