-- 新增公众端默认用户角色，用于 frontend-public 自助注册时自动分配
INSERT INTO role_info (name, code, enabled, built_in, description)
VALUES ('公众用户', 'PUBLIC_DEFAULT', TRUE, TRUE, '公众端自助注册用户的默认角色')
ON CONFLICT (code) DO NOTHING;
