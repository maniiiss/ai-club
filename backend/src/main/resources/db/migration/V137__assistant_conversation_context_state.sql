-- Assistant 长对话压缩状态；消息原文不删除，仅增加可恢复的摘要和结构化事实。
ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS context_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS context_facts_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS pending_clarification_json TEXT NOT NULL DEFAULT '';

ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS summary_through_message_id BIGINT;

ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS context_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS estimated_context_tokens INTEGER NOT NULL DEFAULT 0;
