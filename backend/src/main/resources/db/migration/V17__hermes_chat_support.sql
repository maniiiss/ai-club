-- Hermes 平台内置助手：权限定义与轻量审计日志表。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Hermes 助手', 'hermes:chat', 'ACTION', NULL, NULL, '', 1, 121, TRUE, TRUE, '使用顶部 Hermes 助手能力'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'hermes:chat'
);

-- 默认仅给内置超级管理员自动补齐 Hermes 使用权限，其余角色由管理员按需分配。
INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'hermes:chat'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );

CREATE TABLE hermes_chat_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    scope_key VARCHAR(200) NOT NULL,
    route_name VARCHAR(80) NOT NULL,
    project_id BIGINT,
    task_id BIGINT,
    iteration_id BIGINT,
    plan_id BIGINT,
    role_name VARCHAR(100),
    question_summary VARCHAR(500) NOT NULL DEFAULT '',
    response_summary VARCHAR(1000),
    hermes_response_id VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    error_message VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT fk_hermes_chat_audit_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_hermes_chat_audit_user_id ON hermes_chat_audit(user_id);
CREATE INDEX idx_hermes_chat_audit_scope_key ON hermes_chat_audit(scope_key);
CREATE INDEX idx_hermes_chat_audit_created_at ON hermes_chat_audit(created_at);
