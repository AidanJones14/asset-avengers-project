-- Opt-in development demo identities only. Password: EndgameDemo123!
-- Existing credentials are never reset; UUID/email collisions abort the transaction.
INSERT INTO users(id,email,password_hash,roles,first_name,last_name) VALUES
('de000000-0000-0000-0000-000000000001','cameron.demo@example.com','$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2','{CLIENT}','Cameron','Kelly'),
('de000000-0000-0000-0000-000000000002','carol.demo@example.com','$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2','{CLIENT}','Carol','Jones'),
('de000000-0000-0000-0000-000000000003','daniel.demo@example.com','$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2','{CLIENT}','Daniel','Reed')
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM users WHERE (id,email,first_name,last_name) IN (
 ('de000000-0000-0000-0000-000000000001'::uuid,'cameron.demo@example.com','Cameron','Kelly'),
 ('de000000-0000-0000-0000-000000000002'::uuid,'carol.demo@example.com','Carol','Jones'),
 ('de000000-0000-0000-0000-000000000003'::uuid,'daniel.demo@example.com','Daniel','Reed')) AND roles='{CLIENT}')<>3
 THEN RAISE EXCEPTION 'Demo identity collision: existing identities were not replaced'; END IF;
END $$;
