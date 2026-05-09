-- 系统级环境变量管理：首版固定承载 Gitee 全局凭据运行时覆盖配置。

CREATE TABLE IF NOT EXISTS platform_env_var_config (
    id BIGSERIAL PRIMARY KEY,
    env_key VARCHAR(120) NOT NULL,
    source_type VARCHAR(20) NOT NULL,
    static_value_ciphertext TEXT,
    http_url VARCHAR(500),
    http_headers_ciphertext TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_platform_env_var_config_env_key UNIQUE (env_key)
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '环境变量管理', 'system:env:view', 'MENU', '/env-vars', 'EnvironmentVariableManagementView', 'Key', NULL, 128, TRUE, TRUE, '查看系统级环境变量固定注册表与生效状态'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:env:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '环境变量维护', 'system:env:manage', 'ACTION', NULL, NULL, '', NULL, 129, TRUE, TRUE, '维护系统级环境变量运行时覆盖配置'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:env:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'system:tool:view'
JOIN permission_info ON permission_info.code = 'system:env:view'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'system:tool:manage'
JOIN permission_info ON permission_info.code = 'system:env:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
