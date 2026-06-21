-- 积分功能扣费配置种子数据：需求 AI 助手和测试用例生成。
INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled)
SELECT 'REQUIREMENT_AI', '需求 AI 助手（标准化需求 / 拆解子任务）', 5, TRUE
WHERE NOT EXISTS (SELECT 1 FROM credit_feature_config WHERE feature_code = 'REQUIREMENT_AI');

INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled)
SELECT 'TEST_CASE_AI', '测试用例生成', 5, TRUE
WHERE NOT EXISTS (SELECT 1 FROM credit_feature_config WHERE feature_code = 'TEST_CASE_AI');
