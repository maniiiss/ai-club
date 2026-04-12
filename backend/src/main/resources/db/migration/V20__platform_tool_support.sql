-- Hermes 平台工具：工具配置覆盖与工具执行审计。

CREATE TABLE platform_tool_config (
    id BIGSERIAL PRIMARY KEY,
    tool_code VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(120) NOT NULL DEFAULT '',
    description_override VARCHAR(1000) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    allow_auto_execute BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE platform_tool_audit (
    id BIGSERIAL PRIMARY KEY,
    tool_code VARCHAR(100) NOT NULL,
    tool_name VARCHAR(120) NOT NULL DEFAULT '',
    trigger_source VARCHAR(40) NOT NULL DEFAULT 'HERMES',
    user_id BIGINT,
    scope_key VARCHAR(200),
    project_id BIGINT,
    biz_type VARCHAR(80),
    biz_id BIGINT,
    request_summary VARCHAR(1000) NOT NULL DEFAULT '',
    result_summary VARCHAR(1000) NOT NULL DEFAULT '',
    execution_status VARCHAR(20) NOT NULL,
    error_message VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT fk_platform_tool_audit_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_platform_tool_config_tool_code ON platform_tool_config(tool_code);
CREATE INDEX idx_platform_tool_audit_tool_code ON platform_tool_audit(tool_code);
CREATE INDEX idx_platform_tool_audit_user_id ON platform_tool_audit(user_id);
CREATE INDEX idx_platform_tool_audit_project_id ON platform_tool_audit(project_id);
CREATE INDEX idx_platform_tool_audit_created_at ON platform_tool_audit(created_at DESC);
