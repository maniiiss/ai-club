-- GitPilot Runtime Registry：统一维护 Runtime 能力、健康状态、沙箱和降级策略。

CREATE TABLE runtime_registry (
    runtime_code VARCHAR(40) PRIMARY KEY,
    adapter_type VARCHAR(30) NOT NULL,
    endpoint_ref VARCHAR(200),
    version VARCHAR(100) NOT NULL DEFAULT 'unknown',
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    sandbox_policy_json TEXT NOT NULL DEFAULT '{}',
    fallback_runtime_codes_json TEXT NOT NULL DEFAULT '[]',
    health_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    health_message VARCHAR(1000) NOT NULL DEFAULT '',
    health_checked_at TIMESTAMP,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO runtime_registry(runtime_code, adapter_type, endpoint_ref, version, capabilities_json, sandbox_policy_json, fallback_runtime_codes_json, health_status, health_message)
VALUES
('HERMES_LEGACY', 'CHAT_GATEWAY', 'hermes.gateway', 'legacy', '["CHAT","STREAM_EVENTS","SESSION_RESUME","PLATFORM_TOOLS","REPOSITORY_READ"]', '{"network":"controlled","writeConfirmation":true}', '[]', 'UNKNOWN', '兼容运行时，等待启动探测'),
('PI_RUNTIME', 'STATEFUL_AGENT', 'pi-runtime.internal', '0.73.1', '["CHAT","STREAM_EVENTS","SESSION_RESUME","PLATFORM_TOOLS","REPOSITORY_READ","PLAN","TECHNICAL_DESIGN"]', '{"network":"deny-by-default","workspace":"isolated","writeConfirmation":true}', '["HERMES_LEGACY"]', 'UNKNOWN', '等待 Pi Runtime 部署'),
('CODEX_CLI', 'CLI_RUNNER', 'code-processing.cli', 'managed', '["STREAM_EVENTS","REPOSITORY_READ","REPOSITORY_WRITE","PLAN","TECHNICAL_DESIGN","IMPLEMENT","TEST"]', '{"network":"controlled","workspace":"execution"}', '["CLAUDE_CODE_CLI"]', 'UNKNOWN', '等待 code-processing 探测'),
('CLAUDE_CODE_CLI', 'CLI_RUNNER', 'code-processing.cli', 'managed', '["STREAM_EVENTS","REPOSITORY_READ","REPOSITORY_WRITE","PLAN","TECHNICAL_DESIGN","IMPLEMENT","TEST"]', '{"network":"controlled","workspace":"execution"}', '["CODEX_CLI"]', 'UNKNOWN', '等待 code-processing 探测'),
('OPENCODE_CLI', 'CLI_RUNNER', 'code-processing.cli', 'managed', '["STREAM_EVENTS","REPOSITORY_READ","REPOSITORY_WRITE","PLAN","TECHNICAL_DESIGN","IMPLEMENT","TEST"]', '{"network":"controlled","workspace":"execution"}', '["CODEX_CLI"]', 'UNKNOWN', '等待 code-processing 探测'),
('OPENCLAW', 'CHAT_GATEWAY', 'openclaw.gateway', 'managed', '["CHAT","STREAM_EVENTS","SESSION_RESUME","PLATFORM_TOOLS","REPOSITORY_READ"]', '{"network":"controlled","writeConfirmation":true}', '["HERMES_LEGACY"]', 'UNKNOWN', '等待 OpenClaw 探测')
ON CONFLICT (runtime_code) DO NOTHING;

INSERT INTO permission_info(name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Runtime 管理', 'runtime:manage', 'MENU', '/runtime-registry', 'RuntimeRegistryView', 'Connection', NULL, 46, TRUE, TRUE, '维护 GitPilot Runtime 注册项、能力和健康状态'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'runtime:manage');

INSERT INTO role_permission_rel(role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info JOIN permission_info ON permission_info.code = 'runtime:manage'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1 FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id AND existing_rel.permission_id = permission_info.id
  );
