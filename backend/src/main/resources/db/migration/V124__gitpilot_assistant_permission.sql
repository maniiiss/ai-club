-- GitPilot 中性助手权限；旧 hermes:chat 继续保留，避免旧客户端和自定义角色失效。

INSERT INTO permission_info(name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'GitPilot 助手', 'assistant:chat', 'ACTION', NULL, NULL, '', NULL, 124, TRUE, TRUE, '访问 GitPilot 统一助手入口'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'assistant:chat');

INSERT INTO role_permission_rel(role_id, permission_id)
SELECT role_info.id, assistant_permission.id
FROM role_info
JOIN permission_info hermes_permission ON hermes_permission.code = 'hermes:chat'
JOIN permission_info assistant_permission ON assistant_permission.code = 'assistant:chat'
WHERE EXISTS (
    SELECT 1 FROM role_permission_rel old_rel
    WHERE old_rel.role_id = role_info.id AND old_rel.permission_id = hermes_permission.id
)
AND NOT EXISTS (
    SELECT 1 FROM role_permission_rel new_rel
    WHERE new_rel.role_id = role_info.id AND new_rel.permission_id = assistant_permission.id
);
