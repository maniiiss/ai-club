-- 智能体调用量统计：保存每次 AI 调用的用户/类型/模型/token/状态/耗时，
-- 配合 AgentInvocationRecorder 与 AgentUsageStatsController 提供多维度统计能力。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '智能体调用统计', 'system:agent-usage:view', 'MENU', '/agent-usage-stats', 'AgentUsageStatsView', 'DataLine', NULL, 128, TRUE, TRUE, '查看平台所有智能体的调用量、成功率和 token 趋势'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:agent-usage:view'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'system:agent-usage:view'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );

CREATE TABLE agent_invocation_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    username_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    nickname_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    agent_type VARCHAR(64) NOT NULL,
    agent_code VARCHAR(80),
    agent_id BIGINT,
    action VARCHAR(80),
    provider VARCHAR(20),
    model_config_id BIGINT,
    model_name VARCHAR(120),
    status VARCHAR(20) NOT NULL,
    error_code VARCHAR(80),
    error_message VARCHAR(1000),
    trigger_source VARCHAR(20) NOT NULL DEFAULT 'USER_DIRECT',
    request_uri VARCHAR(255),
    route_name VARCHAR(80),
    project_id BIGINT,
    task_id BIGINT,
    biz_id BIGINT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    input_chars INTEGER,
    output_chars INTEGER,
    duration_ms BIGINT NOT NULL,
    cost_credits INTEGER,
    correlation_id VARCHAR(120),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agent_invocation_log_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_agent_invocation_log_model FOREIGN KEY (model_config_id) REFERENCES ai_model_config(id) ON DELETE SET NULL,
    CONSTRAINT chk_agent_invocation_log_status CHECK (status IN ('SUCCESS','FAILURE','TIMEOUT','CLIENT_DISCONNECTED','RATE_LIMITED','CREDIT_DENIED')),
    CONSTRAINT chk_agent_invocation_log_trigger CHECK (trigger_source IN ('USER_DIRECT','AUTO','SCHEDULED','WEBHOOK','SYSTEM'))
);

CREATE INDEX idx_agent_invocation_log_created_at      ON agent_invocation_log(created_at DESC);
CREATE INDEX idx_agent_invocation_log_user_created_at ON agent_invocation_log(user_id, created_at DESC);
CREATE INDEX idx_agent_invocation_log_type_created_at ON agent_invocation_log(agent_type, created_at DESC);
CREATE INDEX idx_agent_invocation_log_type_status     ON agent_invocation_log(agent_type, status);
CREATE INDEX idx_agent_invocation_log_model_created   ON agent_invocation_log(model_name, created_at DESC);
CREATE INDEX idx_agent_invocation_log_project         ON agent_invocation_log(project_id) WHERE project_id IS NOT NULL;
