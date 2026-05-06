-- 首页快捷入口图标改为默认 Link + 可上传图片，图标字段需支持保存图片 URL。

ALTER TABLE dashboard_shortcut_entry
    ALTER COLUMN icon TYPE VARCHAR(500);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '快捷入口图标上传', 'dashboard:shortcut:upload', 'ACTION', NULL, NULL, '', 1, 122, TRUE, TRUE, '上传首页快捷入口使用的自定义图标图片'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:shortcut:upload'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'dashboard:view'
JOIN permission_info ON permission_info.code = 'dashboard:shortcut:upload'
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
JOIN permission_info AS source_permission ON source_permission.code = 'system:shortcut:manage'
JOIN permission_info ON permission_info.code = 'dashboard:shortcut:upload'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
