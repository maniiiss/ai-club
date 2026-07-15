-- Assistant 会话固定创建时的 Runtime 上下文配置，保障管理员调整配置后历史会话仍可复现。
ALTER TABLE hermes_conversation_session
    ADD COLUMN IF NOT EXISTS runtime_context_profile_snapshot_json TEXT NOT NULL DEFAULT '{}';
