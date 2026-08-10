-- 积分与 Token 关联及智能体计费：模型定价字段、功能计费模式、结算表扩展、调用日志结算标记。
-- 详见 docs/design-docs/credit-token-agent-billing-technical-design-v1.md

-- 1. 模型配置增加 token 定价（积分/千token），token_billing_enabled 默认关闭，按模型灰度开启。
ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS input_credit_per_1k      NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS output_credit_per_1k     NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS cached_input_credit_per_1k NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS token_billing_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN ai_model_config.input_credit_per_1k IS '每千输入token积分单价';
COMMENT ON COLUMN ai_model_config.output_credit_per_1k IS '每千输出token积分单价';
COMMENT ON COLUMN ai_model_config.cached_input_credit_per_1k IS '每千缓存命中输入token单价;null时按input_credit_per_1k*0.5兜底';
COMMENT ON COLUMN ai_model_config.token_billing_enabled IS '是否对该模型启用token计费(灰度开关)';

-- 2. 功能扣费配置增加计费模式：FIXED 固定积分 / TOKEN_BASED 按 token 计费。
--    TOKEN_BASED 模式 cost_amount 不适用，放宽 CHECK 为 >= 0 以允许占位 0。
ALTER TABLE credit_feature_config
    ADD COLUMN IF NOT EXISTS charge_mode VARCHAR(20) NOT NULL DEFAULT 'FIXED';
COMMENT ON COLUMN credit_feature_config.charge_mode IS '计费模式:FIXED固定积分/TOKEN_BASED按token计费';
ALTER TABLE credit_feature_config DROP CONSTRAINT chk_credit_feature_config_cost_amount;
ALTER TABLE credit_feature_config
    ADD CONSTRAINT chk_credit_feature_config_cost_amount CHECK (cost_amount >= 0);

-- 3. 智能体 token 计费功能配置（TOKEN_BASED 模式，cost_amount 占位 0，实际按模型定价×token 计算）。
INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled, charge_mode)
SELECT 'AGENT_TOKEN', '智能体 Token 计费', 0, TRUE, 'TOKEN_BASED'
WHERE NOT EXISTS (SELECT 1 FROM credit_feature_config WHERE feature_code = 'AGENT_TOKEN');

-- 4. 执行任务积分结算表扩展：支持 TOKEN_BASED 模式的预扣/实际/调整流水。
--    FIXED 模式（技术设计）沿用原字段，新增字段为空，状态机 CHARGED->RETAINED/REFUNDED 不变。
ALTER TABLE execution_credit_settlement
    ADD COLUMN IF NOT EXISTS charge_mode           VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    ADD COLUMN IF NOT EXISTS model_config_id       BIGINT REFERENCES ai_model_config(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS prepaid_credits       INTEGER,
    ADD COLUMN IF NOT EXISTS actual_credits        INTEGER,
    ADD COLUMN IF NOT EXISTS adjust_transaction_id BIGINT REFERENCES user_credit_transaction(id);
COMMENT ON COLUMN execution_credit_settlement.charge_mode IS '计费模式:FIXED/TOKEN_BASED';
COMMENT ON COLUMN execution_credit_settlement.model_config_id IS 'TOKEN_BASED模式计费模型配置';
COMMENT ON COLUMN execution_credit_settlement.prepaid_credits IS '预扣积分数(TOKEN_BASED专用)';
COMMENT ON COLUMN execution_credit_settlement.actual_credits IS '实际应扣积分数,终态填(TOKEN_BASED专用)';
COMMENT ON COLUMN execution_credit_settlement.adjust_transaction_id IS '结算调整流水(退差REFUND/补扣CONSUME)';

-- 5. 智能体调用日志增加结算标记，用于幂等回填 cost_credits。
ALTER TABLE agent_invocation_log
    ADD COLUMN IF NOT EXISTS settle_status VARCHAR(20);
COMMENT ON COLUMN agent_invocation_log.settle_status IS '结算状态:SETTLED已回填cost_credits并参与结算';
CREATE INDEX IF NOT EXISTS idx_agent_invocation_log_task_settle
    ON agent_invocation_log(task_id, settle_status)
    WHERE task_id IS NOT NULL AND settle_status IS NOT NULL;
