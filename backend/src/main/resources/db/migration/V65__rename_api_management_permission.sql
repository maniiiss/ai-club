-- 已存在环境里，统一把 API 菜单权限名称修正为“API管理”。

UPDATE permission_info
SET name = 'API管理'
WHERE code = 'api:view';
