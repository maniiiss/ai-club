-- API 管理已升级为独立一级菜单，需要把 api:view 从纯动作权限补齐为菜单权限配置。

UPDATE permission_info
SET type = 'MENU',
    path = '/apis',
    component = 'ProjectApiManagementView',
    icon = 'Connection',
    sort_order = 18,
    description = '查看独立 API 管理菜单与接口工作台'
WHERE code = 'api:view';

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'API 管理', 'api:view', 'MENU', '/apis', 'ProjectApiManagementView', 'Connection', NULL, 18, TRUE, TRUE, '查看独立 API 管理菜单与接口工作台'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'api:view'
);
