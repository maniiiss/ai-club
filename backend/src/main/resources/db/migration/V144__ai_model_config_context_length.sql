-- 为模型配置新增上下文窗口与最大输出字段，供 GitPilot CLI 展示与自动压缩阈值判断。
-- 可空设计：兼容存量数据，区分"未配置"（null，CLI 回退默认 128K/16K）与"0"。
ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS context_length INTEGER;

ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER;
