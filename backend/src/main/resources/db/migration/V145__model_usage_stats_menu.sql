-- 平台模型调用量统计：以模型为中心的看板，复用 agent_invocation_log 数据，
-- 与 AgentUsageStatsService（按智能体/用户维度）互补，新增按模型维度聚合视图。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '模型调用量统计', 'system:model-usage:view', 'MENU', '/model-usage-stats', 'ModelUsageStatsView', 'Cpu', NULL, 129, TRUE, TRUE, '查看平台所有模型的调用量、Token、耗时和成功率'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:model-usage:view'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'system:model-usage:view'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );
