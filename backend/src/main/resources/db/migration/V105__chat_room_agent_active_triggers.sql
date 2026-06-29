ALTER TABLE chat_room_agent_config
    ADD COLUMN IF NOT EXISTS proactive_summary_message_threshold INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS proactive_summary_min_interval_minutes INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS keyword_watch_terms_json TEXT NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS keyword_watch_cooldown_minutes INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS task_status_callback_statuses_json TEXT NOT NULL DEFAULT '["SUCCESS","FAILED","CANCELED"]',
    ADD COLUMN IF NOT EXISTS last_summary_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS last_summary_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS keyword_last_triggered_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS task_status_last_checked_at TIMESTAMP;

ALTER TABLE chat_room_agent_task
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payload_json TEXT NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS uk_chat_agent_task_source_ref
    ON chat_room_agent_task(trigger_type, source_ref)
    WHERE source_ref <> '';
