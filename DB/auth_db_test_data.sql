-- Demo logins for local and Jenkins environments only. Never load this into a real environment.
-- Every account's password is: EndgameDemo123!
-- The ids match DB/endgame_db_test_data.sql, so each login sees that user's seeded trading data.
-- Registration only ever creates CLIENTs, so this file is how ADMIN and ANALYST accounts exist.
INSERT INTO users (id, email, password_hash, roles) VALUES
  ('00000000-0000-0000-0000-000000000001', 'alice.admin@example.com',     '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ADMIN}'),
  ('00000000-0000-0000-0000-000000000002', 'bob.admin@example.com',       '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ADMIN}'),
  ('00000000-0000-0000-0000-000000000003', 'charlie.analyst@example.com', '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}'),
  ('00000000-0000-0000-0000-000000000004', 'diana.analyst@example.com',   '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}'),
  ('00000000-0000-0000-0000-000000000005', 'eve.analyst@example.com',     '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{ANALYST}'),
  ('00000000-0000-0000-0000-000000000006', 'frank.client@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{CLIENT}'),
  ('00000000-0000-0000-0000-000000000007', 'grace.client@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{CLIENT}'),
  ('00000000-0000-0000-0000-000000000008', 'henry.client@example.com',    '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2', '{CLIENT}')
ON CONFLICT (id) DO NOTHING;
