-- Demo logins for local and Jenkins environments only. Never load this into a real environment.
-- Every seeded identity must enroll its own authenticator on first login.
-- No shared MFA secrets or password-reset codes are seeded.
-- Every account's password is: EndgameDemo123!
-- These are development login fixtures, not funded trading portfolios.
-- Endgame creates each matching user/account on first authenticated use, with zero cash.
-- No bank accounts, holdings, orders or watchlist stars are seeded.
-- Registration only ever creates CLIENTs, so this file is how ADMIN and ANALYST accounts exist.
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

-- Rename the dedicated development identities on existing volumes without resetting credentials.
UPDATE users SET email='david.admin@example.com',first_name='David',last_name='Admin'
 WHERE id='00000000-0000-0000-0000-000000000001' AND email IN ('alice.admin@example.com','david.admin@example.com');
UPDATE users SET email='priya.analyst@example.com',first_name='Priya',last_name='Analyst'
 WHERE id='00000000-0000-0000-0000-000000000003' AND email IN ('charlie.analyst@example.com','priya.analyst@example.com');
