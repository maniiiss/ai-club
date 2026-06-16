-- 记录 Hermes 会话内已被用户确认执行过的动作 key 列表。
-- 列表以 JSON 数组字符串保存，支持跨设备/刷新后恢复"已执行"标记，避免重复触发同一写入动作。

ALTER TABLE hermes_conversation_session
    ADD COLUMN executed_action_keys_json TEXT NOT NULL DEFAULT '[]';
