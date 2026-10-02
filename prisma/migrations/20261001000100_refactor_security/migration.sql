BEGIN;

-- Stop rather than merge or rename ambiguous identities.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users GROUP BY lower(btrim(username)) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Username normalization conflicts; resolve identity ownership before migrating';
    END IF;
    IF EXISTS (SELECT 1 FROM users GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Email normalization conflicts; resolve identity ownership before migrating';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE role NOT IN ('user', 'admin')) THEN
        RAISE EXCEPTION 'Unknown user role; resolve before migrating';
    END IF;
    IF EXISTS (SELECT 1 FROM users) AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN
        RAISE EXCEPTION 'Nonempty database has no administrator; explicit operator recovery required';
    END IF;
END $$;

UPDATE users SET username = lower(btrim(username)), email = lower(btrim(email));

-- Preserve each legacy user's currently visible platforms, not future bindings.
UPDATE users u SET public_linked_platforms = COALESCE(
    (SELECT array_agg(DISTINCT a.platform ORDER BY a.platform) FROM linked_accounts a WHERE a.user_id = u.id),
    ARRAY[]::TEXT[]
) WHERE u.public_linked_platforms_configured = false;
ALTER TABLE users DROP COLUMN public_linked_platforms_configured;
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_verify_expires_at TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS pending_email TEXT,
    ADD COLUMN IF NOT EXISTS pending_email_expires_at TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS pending_email_token_hash TEXT;
UPDATE users SET email_verify_token = NULL;
ALTER TABLE users ADD CONSTRAINT users_username_normalized CHECK (username = lower(btrim(username)));
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin'));
DROP INDEX IF EXISTS users_username_lower_key;

-- Rename first: never discard live credentials during the storage cutover.
ALTER TABLE oauth_authorization_codes RENAME COLUMN code TO code_hash;
ALTER TABLE oauth_authorization_codes RENAME COLUMN code_challenge TO code_challenge_hash;
ALTER TABLE oauth_access_tokens RENAME COLUMN token TO token_hash;
ALTER TABLE oauth_refresh_tokens RENAME COLUMN token TO token_hash;
UPDATE oauth_authorization_codes SET
    code_hash = encode(sha256(convert_to(code_hash, 'UTF8')), 'hex'),
    code_challenge_hash = CASE WHEN code_challenge_hash IS NULL THEN NULL ELSE encode(sha256(convert_to(code_challenge_hash, 'UTF8')), 'hex') END;
UPDATE oauth_access_tokens SET token_hash = encode(sha256(convert_to(token_hash, 'UTF8')), 'hex');
UPDATE oauth_refresh_tokens SET token_hash = encode(sha256(convert_to(token_hash, 'UTF8')), 'hex');
ALTER INDEX oauth_authorization_codes_code_key RENAME TO oauth_authorization_codes_code_hash_key;
ALTER INDEX oauth_access_tokens_token_key RENAME TO oauth_access_tokens_token_hash_key;
ALTER INDEX oauth_refresh_tokens_token_key RENAME TO oauth_refresh_tokens_token_hash_key;
ALTER TABLE oauth_access_tokens ADD COLUMN client_auth_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE oauth_refresh_tokens ADD COLUMN client_auth_required BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS users_pending_email_token_hash_key ON users(pending_email_token_hash);
CREATE INDEX users_created_at_id_idx ON users(created_at DESC, id DESC);
CREATE INDEX users_role_idx ON users(role);
CREATE INDEX passkey_credentials_user_id_idx ON passkey_credentials(user_id);
CREATE INDEX oauth_clients_user_id_idx ON oauth_clients(user_id);
CREATE INDEX oauth_authorization_codes_user_id_client_id_used_expires_at_idx ON oauth_authorization_codes(user_id, client_id, used, expires_at);
CREATE INDEX oauth_authorization_codes_client_id_idx ON oauth_authorization_codes(client_id);
CREATE INDEX oauth_authorization_codes_expires_at_idx ON oauth_authorization_codes(expires_at);
CREATE INDEX oauth_access_tokens_user_id_client_id_expires_at_idx ON oauth_access_tokens(user_id, client_id, expires_at);
CREATE INDEX oauth_access_tokens_client_id_idx ON oauth_access_tokens(client_id);
CREATE INDEX oauth_access_tokens_expires_at_idx ON oauth_access_tokens(expires_at);
CREATE INDEX oauth_refresh_tokens_user_id_client_id_revoked_expires_at_idx ON oauth_refresh_tokens(user_id, client_id, revoked, expires_at);
CREATE INDEX oauth_refresh_tokens_client_id_idx ON oauth_refresh_tokens(client_id);
CREATE INDEX oauth_refresh_tokens_expires_at_idx ON oauth_refresh_tokens(expires_at);
CREATE INDEX notices_pinned_published_at_idx ON notices(pinned DESC, published_at DESC);
CREATE INDEX showcase_items_sort_order_created_at_idx ON showcase_items(sort_order, created_at DESC);

COMMIT;
