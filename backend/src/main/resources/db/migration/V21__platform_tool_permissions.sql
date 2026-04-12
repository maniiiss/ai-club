-- 平台工具管理：为系统设置新增工具列表与配置页面权限。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '工具配置', 'system:tool:view', 'MENU', '/tools', 'ToolConfigView', 'Connection', NULL, 123, TRUE, TRUE, '查看平台工具列表与配置页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:tool:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '工具维护', 'system:tool:manage', 'ACTION', NULL, NULL, '', NULL, 124, TRUE, TRUE, '维护平台工具启停、自动执行和描述覆盖'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:tool:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'system:permission:view'
JOIN permission_info ON permission_info.code = 'system:tool:view'
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
JOIN permission_info AS source_permission ON source_permission.code = 'system:permission:manage'
JOIN permission_info ON permission_info.code = 'system:tool:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
