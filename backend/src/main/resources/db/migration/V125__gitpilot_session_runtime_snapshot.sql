-- GitPilot 会话 Runtime 快照：新会话按平台默认 Runtime 固定，历史 Hermes 会话继续兼容。

ALTER TABLE hermes_conversation_session ADD COLUMN IF NOT EXISTS runtime_registry_code VARCHAR(40) DEFAULT 'HERMES_LEGACY';
ALTER TABLE hermes_conversation_session ADD COLUMN IF NOT EXISTS runtime_profile_version BIGINT DEFAULT 1;
UPDATE hermes_conversation_session SET runtime_registry_code = 'HERMES_LEGACY' WHERE runtime_registry_code IS NULL;
UPDATE hermes_conversation_session SET runtime_profile_version = 1 WHERE runtime_profile_version IS NULL;
