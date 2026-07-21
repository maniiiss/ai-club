-- GitPilot CLI 设备 Token 仅保存 hash，明文只在设备授权完成时返回一次。
CREATE TABLE IF NOT EXISTS gitpilot_cli_access_token (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES user_info(id),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    token_prefix VARCHAR(24) NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    client_version VARCHAR(40) NOT NULL DEFAULT '',
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gitpilot_cli_access_token_user
    ON gitpilot_cli_access_token(user_id, revoked_at, expires_at);
