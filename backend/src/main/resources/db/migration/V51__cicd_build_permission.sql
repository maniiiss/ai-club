INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'CI/CD构建', 'cicd:build', 'ACTION', NULL, NULL, '', NULL, 82, TRUE, TRUE, '触发 Jenkins Job 与项目流水线构建'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'cicd:build'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT source_rel.role_id, target_permission.id
FROM role_permission_rel source_rel
JOIN permission_info source_permission
    ON source_permission.code = 'cicd:manage'
   AND source_rel.permission_id = source_permission.id
JOIN permission_info target_permission
    ON target_permission.code = 'cicd:build'
LEFT JOIN role_permission_rel existing_rel
    ON existing_rel.role_id = source_rel.role_id
   AND existing_rel.permission_id = target_permission.id
WHERE existing_rel.role_id IS NULL;
