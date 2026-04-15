-- 仓库扫描规则集配置：支持后台维护多份规则集并提供独立菜单。

CREATE TABLE repository_scan_ruleset (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    engine_type VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_selected BOOLEAN NOT NULL DEFAULT FALSE,
    definition_content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_repository_scan_ruleset_code UNIQUE (code)
);

CREATE INDEX idx_repository_scan_ruleset_enabled ON repository_scan_ruleset(enabled);
CREATE INDEX idx_repository_scan_ruleset_default_selected ON repository_scan_ruleset(default_selected);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '扫描规则集', 'scan:ruleset:view', 'MENU', '/scan-rulesets', 'RepositoryScanRulesetView', 'Search', NULL, 125, TRUE, TRUE, '查看扫描规则集管理页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'scan:ruleset:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '扫描规则集维护', 'scan:ruleset:manage', 'ACTION', NULL, NULL, '', NULL, 126, TRUE, TRUE, '维护扫描规则集配置'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'scan:ruleset:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'gitlab:view'
JOIN permission_info ON permission_info.code = 'scan:ruleset:view'
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
JOIN permission_info AS source_permission ON source_permission.code = 'gitlab:manage'
JOIN permission_info ON permission_info.code = 'scan:ruleset:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
