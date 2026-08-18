-- 模型计费倍率与平台级 1x 基准价。
-- 业务意图：管理员只维护平台统一基准价和模型倍率，实际扣费仍读取模型上的输入/输出单价。
ALTER TABLE credit_global_config
    ADD COLUMN IF NOT EXISTS model_base_input_credit_per_1k NUMERIC(10,4) NOT NULL DEFAULT 0.0200,
    ADD COLUMN IF NOT EXISTS model_base_output_credit_per_1k NUMERIC(10,4) NOT NULL DEFAULT 0.0600;

COMMENT ON COLUMN credit_global_config.model_base_input_credit_per_1k IS '模型 1x 基准输入 token 单价（积分/千 token）';
COMMENT ON COLUMN credit_global_config.model_base_output_credit_per_1k IS '模型 1x 基准输出 token 单价（积分/千 token）';

ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS billing_multiplier NUMERIC(10,4);

COMMENT ON COLUMN ai_model_config.billing_multiplier IS '模型计费倍率；实际输入/输出单价分别为平台 1x 基准价乘以该倍率';

ALTER TABLE ai_model_config
    DROP CONSTRAINT IF EXISTS chk_ai_model_config_billing_multiplier;

ALTER TABLE ai_model_config
    ADD CONSTRAINT chk_ai_model_config_billing_multiplier
        CHECK (billing_multiplier IS NULL OR billing_multiplier > 0);

-- 为已有按 token 计费模型补齐展示倍率，尽量保持其现有实际单价不变。
UPDATE ai_model_config model
SET billing_multiplier = ROUND(model.input_credit_per_1k / NULLIF(base.model_base_input_credit_per_1k, 0), 4)
FROM credit_global_config base
WHERE base.id = 1
  AND model.token_billing_enabled = TRUE
  AND model.billing_multiplier IS NULL
  AND model.input_credit_per_1k IS NOT NULL
  AND base.model_base_input_credit_per_1k > 0;

-- 基准价为 0 或历史数据不完整时，使用 1x 作为安全展示值；实际单价仍保留原值。
UPDATE ai_model_config
SET billing_multiplier = 1.0000
WHERE token_billing_enabled = TRUE
  AND billing_multiplier IS NULL
  AND input_credit_per_1k IS NOT NULL
  AND output_credit_per_1k IS NOT NULL;
