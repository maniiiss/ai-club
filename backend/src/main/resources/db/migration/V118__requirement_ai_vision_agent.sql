-- 需求 AI 图片理解 Agent 默认关闭且不绑定模型，避免部署升级后意外产生视觉模型调用。
-- 管理员确认所选模型支持多模态输入后，可在智能体管理页面绑定模型并启用。
INSERT INTO agent_info (
    name,
    type,
    access_type,
    builtin_code,
    status,
    enabled,
    capability,
    description,
    system_prompt,
    timeout_seconds
)
SELECT '图片理解智能体',
       '规划',
       'LLM_VISION',
       'IMAGE_UNDERSTANDING',
       '离线',
       FALSE,
       '理解需求附件和正文中的平台图片',
       '需求 AI 助手专用图片理解智能体。管理员绑定支持多模态输入的对话模型并启用后，异步分析会提取图片中的界面、流程、字段和约束。',
       '你是需求分析中的图片理解助手。请仅描述图片中可观察到的界面、文字、流程、字段、状态和交互约束；无法确认的内容必须明确标记为不确定，不要推测敏感信息，也不要输出与需求分析无关的内容。',
       120
WHERE NOT EXISTS (
    SELECT 1 FROM agent_info WHERE builtin_code = 'IMAGE_UNDERSTANDING'
);
