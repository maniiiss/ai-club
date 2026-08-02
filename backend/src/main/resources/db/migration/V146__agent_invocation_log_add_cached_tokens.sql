-- 模型调用量统计:缓存命中读取的输入 token 数。
-- OpenAI prompt_tokens_details.cached_tokens / Anthropic cache_read_input_tokens 归一化;
-- null 表示上游未返回或 provider 不支持缓存。历史数据不回填。
ALTER TABLE agent_invocation_log ADD COLUMN cached_tokens INTEGER;
COMMENT ON COLUMN agent_invocation_log.cached_tokens IS '缓存命中读取的输入token数(OpenAI cached_tokens / Anthropic cache_read_input_tokens);null表示上游未返回或provider不支持缓存';
