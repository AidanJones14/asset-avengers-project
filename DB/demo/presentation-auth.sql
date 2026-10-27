-- 72 additional presentation clients. Stable IDs; never reset existing passwords/MFA.
INSERT INTO users(id,email,password_hash,roles,first_name,last_name)
SELECT ('de000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,email,
 '$2b$10$XJ2SvU5yMBYQfPZP55.1l.Q0T5wIGOynaICT8JuG0vyNgIm92Eby2','{CLIENT}',first_name,last_name
FROM (SELECT n,
 (ARRAY['Avery','Cameron','Casey','Jordan','Morgan','Riley','Sam','Taylor','Alex','Jamie','Robin','Skyler'])[(n-201)%12+1] AS first_name,
 (ARRAY['Adams','Bennett','Clark','Davis','Ellis','Franklin'])[(n-201)/12+1] AS last_name,
 'client.'||n||'.demo@example.com' AS email
 FROM generate_series(201,272) n) p ON CONFLICT(id) DO NOTHING;
-- Fail on UUID identity collisions rather than silently attaching demo funding to someone else.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM (SELECT n,
 (ARRAY['Avery','Cameron','Casey','Jordan','Morgan','Riley','Sam','Taylor','Alex','Jamie','Robin','Skyler'])[(n-201)%12+1] AS first_name,
 (ARRAY['Adams','Bennett','Clark','Davis','Ellis','Franklin'])[(n-201)/12+1] AS last_name,
 'client.'||n||'.demo@example.com' AS email
 FROM generate_series(201,272) n) p LEFT JOIN users u
 ON u.id=('de000000-0000-0000-0000-'||lpad(p.n::text,12,'0'))::uuid
 WHERE u.id IS NULL OR u.email<>p.email OR u.roles<>'{CLIENT}')
 THEN RAISE EXCEPTION 'Presentation demo identity collision; existing identities preserved'; END IF;
END $$;
