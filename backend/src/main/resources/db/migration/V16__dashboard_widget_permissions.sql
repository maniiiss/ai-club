-- 首页看板组件级权限：将首页页面权限与小组件可见权限分离。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-总项目数量组件', 'dashboard:widget:project-stats', 'ACTION', NULL, NULL, '', 1, 112, TRUE, TRUE, '查看首页看板中的总项目数量组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:project-stats'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-活跃智能体组件', 'dashboard:widget:agent-stats', 'ACTION', NULL, NULL, '', 1, 113, TRUE, TRUE, '查看首页看板中的活跃智能体组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:agent-stats'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-任务总览组件', 'dashboard:widget:task-stats', 'ACTION', NULL, NULL, '', 1, 114, TRUE, TRUE, '查看首页看板中的任务总览组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:task-stats'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-快速构建组件', 'dashboard:widget:quick-build', 'ACTION', NULL, NULL, '', 1, 115, TRUE, TRUE, '查看首页看板中的快速构建组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:quick-build'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-GitLab快速发起MR组件', 'dashboard:widget:quick-merge', 'ACTION', NULL, NULL, '', 1, 116, TRUE, TRUE, '查看首页看板中的 GitLab 快速发起 MR 组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:quick-merge'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-活跃项目组件', 'dashboard:widget:active-projects', 'ACTION', NULL, NULL, '', 1, 117, TRUE, TRUE, '查看首页看板中的活跃项目组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:active-projects'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-在线智能体组件', 'dashboard:widget:online-agents', 'ACTION', NULL, NULL, '', 1, 118, TRUE, TRUE, '查看首页看板中的在线智能体组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:online-agents'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-最近任务组件', 'dashboard:widget:recent-tasks', 'ACTION', NULL, NULL, '', 1, 119, TRUE, TRUE, '查看首页看板中的最近任务组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:recent-tasks'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '首页看板-快捷任务组件', 'dashboard:widget:quick-tasks', 'ACTION', NULL, NULL, '', 1, 120, TRUE, TRUE, '查看首页看板中的快捷任务组件'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'dashboard:widget:quick-tasks'
);

-- 仅给内置超级管理员自动补齐首页组件权限，其余角色由管理员手动分配。
INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN (
    'dashboard:widget:project-stats',
    'dashboard:widget:agent-stats',
    'dashboard:widget:task-stats',
    'dashboard:widget:quick-build',
    'dashboard:widget:quick-merge',
    'dashboard:widget:active-projects',
    'dashboard:widget:online-agents',
    'dashboard:widget:recent-tasks',
    'dashboard:widget:quick-tasks'
)
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );
