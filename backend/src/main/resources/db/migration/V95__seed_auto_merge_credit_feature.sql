-- 种子：AI 审核自动合并计费策略
-- 每次实际调用 AI 审核（指纹未命中缓存）消耗 cost_amount 积分
INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled)
SELECT 'AUTO_MERGE', 'AI 审核自动合并', 5, TRUE
WHERE NOT EXISTS (SELECT 1 FROM credit_feature_config WHERE feature_code = 'AUTO_MERGE');
