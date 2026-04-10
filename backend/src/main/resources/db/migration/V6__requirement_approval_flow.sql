-- 需求评审、开发、测试通过控制与权限。

ALTER TABLE task_info
    ADD COLUMN IF NOT EXISTS review_passed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dev_passed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS test_passed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE task_info
SET review_passed = TRUE
WHERE work_item_type = '需求'
  AND status <> '草稿';

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '需求评审通过', 'task:requirement:review', 'ACTION', NULL, NULL, '', NULL, 42, TRUE, TRUE, '标记需求评审通过'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'task:requirement:review'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '需求开发通过', 'task:requirement:dev', 'ACTION', NULL, NULL, '', NULL, 43, TRUE, TRUE, '标记需求开发通过'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'task:requirement:dev'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '需求测试通过', 'task:requirement:test', 'ACTION', NULL, NULL, '', NULL, 44, TRUE, TRUE, '标记需求测试通过'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'task:requirement:test'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN (
    'task:requirement:review',
    'task:requirement:dev',
    'task:requirement:test'
)
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );
