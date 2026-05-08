-- PR评审统计：在系统管理下新增专项统计菜单，用于查看打回率和未合并任务。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'PR评审统计', 'system:pr-review:view', 'MENU', '/pr-review-stats', 'PrReviewStatsView', 'DataAnalysis', NULL, 127, TRUE, TRUE, '查看PR评审打回率与合并情况统计页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:pr-review:view'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'system:tool:view'
JOIN permission_info ON permission_info.code = 'system:pr-review:view'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
