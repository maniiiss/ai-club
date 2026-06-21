-- 需求 AI 助手内置智能体种子数据。
-- 管理员可在智能体管理页面为每个动作绑定默认模型（ai_model_config_id），
-- TaskRequirementAiService 在请求未指定 modelConfigId 时优先查找对应智能体的模型配置。

INSERT INTO agent_info (name, type, access_type, builtin_code, status, enabled, capability, description, timeout_seconds)
SELECT '标准化需求智能体', '规划', 'BUILT_IN', 'REQUIREMENT_AI_STANDARDIZE', '在线', TRUE,
       '将需求描述标准化为规范文档格式',
       '需求 AI 助手专用智能体，管理员可绑定默认对话模型。公众端调用「标准化需求」动作时使用此智能体的模型配置。',
       120
WHERE NOT EXISTS (SELECT 1 FROM agent_info WHERE builtin_code = 'REQUIREMENT_AI_STANDARDIZE');

INSERT INTO agent_info (name, type, access_type, builtin_code, status, enabled, capability, description, timeout_seconds)
SELECT '拆解子任务智能体', '规划', 'BUILT_IN', 'REQUIREMENT_AI_BREAKDOWN', '在线', TRUE,
       '将需求拆解为可执行的子任务列表',
       '需求 AI 助手专用智能体，管理员可绑定默认对话模型。公众端调用「拆解子任务」动作时使用此智能体的模型配置。',
       120
WHERE NOT EXISTS (SELECT 1 FROM agent_info WHERE builtin_code = 'REQUIREMENT_AI_BREAKDOWN');

INSERT INTO agent_info (name, type, access_type, builtin_code, status, enabled, capability, description, timeout_seconds)
SELECT '测试用例生成智能体', '测试', 'BUILT_IN', 'REQUIREMENT_AI_TEST_CASES', '在线', TRUE,
       '基于需求自动生成结构化测试用例',
       '需求 AI 助手专用智能体，管理员可绑定默认对话模型。公众端调用「生成测试用例」动作时使用此智能体的模型配置。',
       120
WHERE NOT EXISTS (SELECT 1 FROM agent_info WHERE builtin_code = 'REQUIREMENT_AI_TEST_CASES');
