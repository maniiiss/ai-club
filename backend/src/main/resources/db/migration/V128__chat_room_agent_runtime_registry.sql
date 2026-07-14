-- 聊天室 Agent 绑定 Runtime 注册项；历史聊天室继续使用 Hermes Legacy 兼容链路。
ALTER TABLE chat_room_agent_config
    ADD COLUMN IF NOT EXISTS runtime_registry_code VARCHAR(40) NOT NULL DEFAULT 'HERMES_LEGACY';

UPDATE chat_room_agent_config
SET runtime_registry_code = 'HERMES_LEGACY'
WHERE runtime_registry_code IS NULL OR TRIM(runtime_registry_code) = '';
