-- 移除需求开发通过、测试通过权限与流程。
DELETE FROM role_permission_rel
WHERE permission_id IN (
    SELECT id FROM permission_info WHERE code IN ('task:requirement:dev', 'task:requirement:test')
);

DELETE FROM permission_info
WHERE code IN ('task:requirement:dev', 'task:requirement:test');
