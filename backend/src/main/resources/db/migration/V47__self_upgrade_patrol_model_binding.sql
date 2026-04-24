-- 自升级中心：把旧版“巡检 Agent”结构平滑升级为“巡检计划绑定模型配置”。

-- 旧版中心配置里还保留了 patrol_agent_id，这一版彻底移除，避免巡检成本继续和固定 Agent 绑定。
ALTER TABLE self_upgrade_center_config
    DROP CONSTRAINT IF EXISTS fk_self_upgrade_center_config_patrol_agent;

ALTER TABLE self_upgrade_center_config
    DROP COLUMN IF EXISTS patrol_agent_id;

-- 旧版巡检计划没有模型绑定字段；补齐 ai_model_config_id 之后，后端才能按计划直接选择便宜模型巡检。
ALTER TABLE self_upgrade_patrol_plan
    ADD COLUMN IF NOT EXISTS ai_model_config_id BIGINT;

-- 已存在计划的老库需要回填一个可用的 CHAT 模型，避免实体映射和后续执行桥接在启动期失败。
WITH fallback_chat_model AS (
    SELECT id
    FROM ai_model_config
    WHERE enabled = TRUE
      AND UPPER(COALESCE(model_type, '')) = 'CHAT'
    ORDER BY id
    LIMIT 1
)
UPDATE self_upgrade_patrol_plan plan
SET ai_model_config_id = fallback_chat_model.id
FROM fallback_chat_model
WHERE plan.ai_model_config_id IS NULL;

DO $$
DECLARE
    remaining_null_count BIGINT;
BEGIN
    SELECT COUNT(*)
    INTO remaining_null_count
    FROM self_upgrade_patrol_plan
    WHERE ai_model_config_id IS NULL;

    IF remaining_null_count > 0 THEN
        RAISE EXCEPTION 'self_upgrade_patrol_plan.ai_model_config_id 仍有 % 条空值，请先配置至少一个启用的 CHAT 模型后再升级', remaining_null_count;
    END IF;
END $$;

ALTER TABLE self_upgrade_patrol_plan
    ALTER COLUMN ai_model_config_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_self_upgrade_patrol_plan_model'
          AND conrelid = 'self_upgrade_patrol_plan'::regclass
    ) THEN
        ALTER TABLE self_upgrade_patrol_plan
            ADD CONSTRAINT fk_self_upgrade_patrol_plan_model
                FOREIGN KEY (ai_model_config_id) REFERENCES ai_model_config(id);
    END IF;
END $$;
