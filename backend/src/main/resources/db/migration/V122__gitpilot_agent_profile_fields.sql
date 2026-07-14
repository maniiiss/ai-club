-- Agent Profile 兼容字段：不重写历史 runtime_type，新增字段采用双读和快照策略。

ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS runtime_registry_code VARCHAR(40);
ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS profile_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS runtime_fallback_codes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS tool_policy_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS sandbox_policy_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS budget_tokens INTEGER;
ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS session_policy_json TEXT NOT NULL DEFAULT '{}';
