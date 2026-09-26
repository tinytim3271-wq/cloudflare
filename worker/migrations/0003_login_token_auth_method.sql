ALTER TABLE login_tokens
ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'magic_link'
CHECK (auth_method IN ('magic_link', 'google'));
