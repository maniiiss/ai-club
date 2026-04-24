-- 自升级中心：初始化一条示例巡检计划，帮助管理员首次进入页面时快速理解配置方式。
-- 说明：
-- 1. 只在存在启用中的 CHAT 模型时插入，避免空模型环境直接迁移失败。
-- 2. 默认开启计划但关闭夜间调度，管理员可以立即手动试跑，也不会在夜间自动触发。

INSERT INTO self_upgrade_patrol_plan (
    name,
    description,
    environment_profile_id,
    ai_model_config_id,
    scheduler_cron,
    scheduler_enabled,
    max_exploration_steps,
    target_timeout_seconds,
    run_timeout_seconds,
    enabled
)
SELECT
    'STAGING 示例巡检计划',
    '用于演示自升级中心如何配置模型驱动巡检。正式启用前，请先把 STAGING 环境地址、登录脚本和入口路径改成真实可访问页面。',
    env.id,
    model.id,
    '0 0 2 * * *',
    FALSE,
    25,
    600,
    1800,
    TRUE
FROM self_upgrade_environment_profile env
JOIN (
    SELECT id
    FROM ai_model_config
    WHERE enabled = TRUE
      AND UPPER(COALESCE(model_type, '')) = 'CHAT'
    ORDER BY id
    LIMIT 1
) model ON TRUE
WHERE env.code = 'STAGING'
  AND NOT EXISTS (
      SELECT 1
      FROM self_upgrade_patrol_plan
      WHERE name = 'STAGING 示例巡检计划'
  );

INSERT INTO self_upgrade_patrol_target (
    plan_id,
    name,
    seed_url,
    goal_prompt,
    ready_selector,
    allow_write,
    write_allowlist_override_json,
    max_steps_override,
    sort_order,
    enabled
)
SELECT
    plan.id,
    '首页核心路径巡检',
    '/',
    '检查登录后首页是否能正常进入，重点关注首屏是否空白、主要导航是否可见、核心 CTA 文案是否清晰，以及是否出现明显报错或阻断流程的提示。',
    '',
    FALSE,
    '[]',
    NULL,
    10,
    TRUE
FROM self_upgrade_patrol_plan plan
WHERE plan.name = 'STAGING 示例巡检计划'
  AND NOT EXISTS (
      SELECT 1
      FROM self_upgrade_patrol_target target
      WHERE target.plan_id = plan.id
        AND target.name = '首页核心路径巡检'
  );

INSERT INTO self_upgrade_patrol_target (
    plan_id,
    name,
    seed_url,
    goal_prompt,
    ready_selector,
    allow_write,
    write_allowlist_override_json,
    max_steps_override,
    sort_order,
    enabled
)
SELECT
    plan.id,
    '设置页表单体验巡检',
    '/settings',
    '重点查看设置页或个人资料页中的表单标签、必填提示、保存按钮状态、成功/失败反馈是否容易理解。不要执行未命中白名单的写操作。',
    '',
    FALSE,
    '[]',
    NULL,
    20,
    TRUE
FROM self_upgrade_patrol_plan plan
WHERE plan.name = 'STAGING 示例巡检计划'
  AND NOT EXISTS (
      SELECT 1
      FROM self_upgrade_patrol_target target
      WHERE target.plan_id = plan.id
        AND target.name = '设置页表单体验巡检'
  );
