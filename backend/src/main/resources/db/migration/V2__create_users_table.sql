CREATE TABLE app_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(80) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_app_users_role CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    CONSTRAINT chk_app_users_username CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,49}$')
);
