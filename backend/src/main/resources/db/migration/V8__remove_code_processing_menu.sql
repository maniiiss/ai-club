-- 移除“代码处理”菜单权限，避免现网继续展示已经下线的入口。

DELETE FROM permission_info
WHERE code = 'code:view';
