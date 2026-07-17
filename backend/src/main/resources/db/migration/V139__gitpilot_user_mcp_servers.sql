-- GitPilot 用户个人 MCP 服务配置；凭证与会话快照均以密文保存。
CREATE TABLE IF NOT EXISTS assistant_mcp_server (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES user_info(id),
    name VARCHAR(120) NOT NULL,
    endpoint_url VARCHAR(1000) NOT NULL,
    transport VARCHAR(30) NOT NULL DEFAULT 'AUTO',
    auth_type VARCHAR(30) NOT NULL DEFAULT 'NONE',
    credential_ciphertext TEXT NOT NULL DEFAULT '',
    config_history_ciphertext TEXT NOT NULL DEFAULT '[]',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config_version BIGINT NOT NULL DEFAULT 1,
    connection_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    connection_message VARCHAR(1000) NOT NULL DEFAULT '',
    server_info_json TEXT NOT NULL DEFAULT '{}',
    tools_json TEXT NOT NULL DEFAULT '[]',
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_assistant_mcp_server_user_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_assistant_mcp_server_user
    ON assistant_mcp_server(user_id, enabled, id);

ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS external_mcp_snapshot_ciphertext TEXT NOT NULL DEFAULT '';
