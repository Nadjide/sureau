ALTER TABLE app_users
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_app_users_auth_version CHECK (auth_version >= 0);
