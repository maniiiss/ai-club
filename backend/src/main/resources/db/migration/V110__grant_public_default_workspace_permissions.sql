-- 公众端工作台权限下放：给 PUBLIC_DEFAULT 角色补授工作台相关权限。
--
-- 背景：frontend-public 公众端工作台新增了「GitLab 快速发起 MR」「快捷任务便签」
-- 「在线智能体」「快速构建」「常用系统访问入口」五张卡片，这些卡片依赖
-- dashboard:view / gitlab:view / gitlab:manage / cicd:view / cicd:build 权限。
-- 但 PUBLIC_DEFAULT（公众端自助注册用户默认角色）此前只授了 hermes/chat/data-workbench
-- 相关权限，自助注册用户无法使用工作台卡片（现有工作台能跑是因为测试账号被额外授权）。
--
-- 这些权限码在 V1__baseline_schema.sql 中已定义，后端 Controller 接口也已存在，
-- 本迁移仅补角色-权限关联，不新增权限点、不新增接口。
-- dashboard:widget:* 是管理端前端组件可见性权限，后端不校验，公众端前端自行控制卡片可见性，故不补。

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN (
    'dashboard:view',
    'gitlab:view',
    'gitlab:manage',
    'cicd:view',
    'cicd:build'
)
WHERE role_info.code = 'PUBLIC_DEFAULT'
  AND NOT EXISTS (
      SELECT 1 FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id
        AND existing_rel.permission_id = permission_info.id
  );
