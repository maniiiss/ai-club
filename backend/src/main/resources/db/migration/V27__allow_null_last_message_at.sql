-- 允许 hermes_conversation_session 表的 last_message_at 字段为 null
-- 用于标识未使用的会话（没有任何消息的会话）

ALTER TABLE hermes_conversation_session
ALTER COLUMN last_message_at DROP NOT NULL;

-- 将已有的空会话（没有消息记录的会话）的 last_message_at 设置为 null
UPDATE hermes_conversation_session hcs
SET last_message_at = NULL
WHERE NOT EXISTS (
    SELECT 1 FROM hermes_conversation_message hcm
    WHERE hcm.session_id = hcs.id
);
