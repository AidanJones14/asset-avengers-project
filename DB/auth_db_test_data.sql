-- Demo logins for local and Jenkins environments only. Never load this into a real environment.
-- Seeded staff must enroll their own authenticator on first login.
-- New seeded clients default to optional MFA; existing enrollments and opt-ins are preserved.
-- No shared MFA secrets or password-reset codes are seeded.
-- Every account's password is: EndgameDemo123!
-- These are development login fixtures, not funded trading portfolios.
-- Endgame creates each matching user/account on first authenticated use, with zero cash.
-- No bank accounts, holdings, orders or watchlist stars are seeded.
-- Registration only ever creates CLIENTs. Seeded ADMIN/ANALYST logins are shared demo accounts;
-- new staff accounts come from the SUPER_ADMIN below through the staff routes.
INSERT INTO users (id, email, password_hash, roles) VALUES
  ('00000000-0000-0000-0000-000000000001', 'david.admin@example.com',     '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ADMIN}'),
  ('00000000-0000-0000-0000-000000000002', 'bob.admin@example.com',       '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ADMIN}'),
  ('00000000-0000-0000-0000-000000000003', 'priya.analyst@example.com', '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}'),
  ('00000000-0000-0000-0000-000000000004', 'diana.analyst@example.com',   '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}'),
  ('00000000-0000-0000-0000-000000000005', 'eve.analyst@example.com',     '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}'),
  ('00000000-0000-0000-0000-000000000006', 'frank.client@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{CLIENT}'),
  ('00000000-0000-0000-0000-000000000007', 'grace.client@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{CLIENT}'),
  ('00000000-0000-0000-0000-000000000008', 'henry.client@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{CLIENT}')
ON CONFLICT (id) DO NOTHING;

-- Fixture names are auth-owned; never infer names for real users from their email.
UPDATE users SET first_name=v.first_name,last_name=v.last_name
FROM (VALUES
 ('00000000-0000-0000-0000-000000000001'::uuid,'David','Admin'),
 ('00000000-0000-0000-0000-000000000002'::uuid,'Bob','Admin'),
 ('00000000-0000-0000-0000-000000000003'::uuid,'Priya','Analyst'),
 ('00000000-0000-0000-0000-000000000004'::uuid,'Diana','Analyst'),
 ('00000000-0000-0000-0000-000000000005'::uuid,'Eve','Analyst'),
 ('00000000-0000-0000-0000-000000000006'::uuid,'Frank','Client'),
 ('00000000-0000-0000-0000-000000000007'::uuid,'Grace','Client'),
 ('00000000-0000-0000-0000-000000000008'::uuid,'Henry','Client')
) AS v(id,first_name,last_name)
WHERE users.id=v.id AND users.first_name IS NULL AND users.last_name IS NULL;

-- Staff security D2/D3: the one SUPER_ADMIN, who creates admins through POST /auth/admin/staff/admins.
-- Same demo password, but it must be replaced at first login, then an authenticator enrolled.
-- (…0009 is the fake staff `sub` the test scripts mint, so this uses …0010.)
INSERT INTO users (id, email, password_hash, roles, first_name, last_name, password_change_required) VALUES
  ('00000000-0000-0000-0000-000000000010', 'super.admin@example.com', '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{SUPER_ADMIN}', 'Super', 'Admin', true)
ON CONFLICT (id) DO NOTHING;

-- TEMPORARY dev accounts for DEV_MFA_BYPASS (auth-server/src/auth/dev-mfa-bypass.ts); remove with it.
-- Switch on: they sign in with the password alone. Switch off: they can't sign in at all.
-- Their user_mfa row is marked enrolled, so the session check accepts the switch's MFA-verified
-- session, but has no secret and is locked until 9999, so no code, setup or replacement can succeed.
-- (Not 'infinity': node-postgres reads it as Infinity, an invalid Date, and the lock check misses it.)
INSERT INTO users (id, email, password_hash, roles, first_name, last_name) VALUES
  ('00000000-0000-0000-0000-000000000011', 'dev.superadmin@example.com', '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{SUPER_ADMIN}', 'Dev', 'SuperAdmin'),
  ('00000000-0000-0000-0000-000000000012', 'dev.admin@example.com',      '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ADMIN}',       'Dev', 'Admin'),
  ('00000000-0000-0000-0000-000000000013', 'dev.analyst@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}',     'Dev', 'Analyst')
ON CONFLICT DO NOTHING;
INSERT INTO user_mfa (user_id, secret_ciphertext, enabled_at, locked_until)
SELECT id, NULL, now(), '9999-12-31 00:00:00+00' FROM users
 WHERE id IN ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013')
ON CONFLICT (user_id) DO NOTHING;

-- Rename the dedicated development identities on existing volumes without resetting credentials.
UPDATE users SET email='david.admin@example.com',first_name='David',last_name='Admin'
 WHERE id='00000000-0000-0000-0000-000000000001' AND email IN ('alice.admin@example.com','david.admin@example.com');
UPDATE users SET email='priya.analyst@example.com',first_name='Priya',last_name='Analyst'
 WHERE id='00000000-0000-0000-0000-000000000003' AND email IN ('charlie.analyst@example.com','priya.analyst@example.com');
