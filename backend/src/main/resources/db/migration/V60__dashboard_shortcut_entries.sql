-- 首页常用系统访问入口：统一维护系统级入口，并允许用户维护自己的常用跳转。

CREATE TABLE dashboard_shortcut_entry (
    id BIGSERIAL PRIMARY KEY,
    scope_type VARCHAR(20) NOT NULL,
    owner_user_id BIGINT,
    name VARCHAR(120) NOT NULL,
    url VARCHAR(500) NOT NULL,
    icon VARCHAR(80) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dashboard_shortcut_entry_owner_user FOREIGN KEY (owner_user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE INDEX idx_dashboard_shortcut_entry_scope_sort ON dashboard_shortcut_entry(scope_type, enabled, sort_order, id);
CREATE INDEX idx_dashboard_shortcut_entry_owner_sort ON dashboard_shortcut_entry(owner_user_id, sort_order, id);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-常用系统访问入口组件', 'dashboard:widget:system-shortcuts', 'ACTION', NULL, NULL, '', 1, 121, TRUE, TRUE, '查看首页看板中的常用系统访问入口组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:system-shortcuts'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'dashboard:widget:quick-tasks'
JOIN permission_info ON permission_info.code = 'dashboard:widget:system-shortcuts'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '快捷入口管理', 'system:shortcut:view', 'MENU', '/shortcuts', 'ShortcutEntryManagementView', 'Link', NULL, 125, TRUE, TRUE, '查看系统管理中的快捷入口列表与配置页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:shortcut:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '快捷入口维护', 'system:shortcut:manage', 'ACTION', NULL, NULL, '', NULL, 126, TRUE, TRUE, '维护系统级快捷入口的新增、编辑、删除与启停'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:shortcut:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'system:tool:view'
JOIN permission_info ON permission_info.code = 'system:shortcut:view'
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
JOIN permission_info ON permission_info.code = 'system:shortcut:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
