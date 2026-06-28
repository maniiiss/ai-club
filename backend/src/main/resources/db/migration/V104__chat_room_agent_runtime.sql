ALTER TABLE chat_message
    ADD COLUMN IF NOT EXISTS agent_task_id BIGINT;

CREATE TABLE chat_room_agent_config (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    display_name VARCHAR(100) NOT NULL DEFAULT 'Hermes',
    system_instruction TEXT NOT NULL DEFAULT '',
    proactive_summary_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    keyword_watch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    task_status_callback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_by_user_id BIGINT,
    authorized_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_agent_config_room FOREIGN KEY (room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_agent_config_authorized_by FOREIGN KEY (authorized_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE chat_room_agent_tool_policy (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL,
    tool_code VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_execute BOOLEAN NOT NULL DEFAULT FALSE,
    read_only_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
    risk_level_snapshot VARCHAR(30) NOT NULL DEFAULT 'LOW',
    updated_by_user_id BIGINT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_agent_tool_room FOREIGN KEY (room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_agent_tool_user FOREIGN KEY (updated_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_chat_agent_tool UNIQUE (room_id, tool_code)
);

CREATE INDEX idx_chat_agent_tool_room ON chat_room_agent_tool_policy(room_id);

CREATE TABLE chat_room_agent_task (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL,
    assistant_message_id BIGINT,
    trigger_message_id BIGINT,
    trigger_user_id BIGINT,
    authorized_by_user_id BIGINT,
    trigger_type VARCHAR(30) NOT NULL DEFAULT 'MENTION',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    source VARCHAR(100) NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_agent_task_room FOREIGN KEY (room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_agent_task_assistant_message FOREIGN KEY (assistant_message_id) REFERENCES chat_message(id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_agent_task_trigger_message FOREIGN KEY (trigger_message_id) REFERENCES chat_message(id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_agent_task_trigger_user FOREIGN KEY (trigger_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_agent_task_authorized_by FOREIGN KEY (authorized_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_chat_agent_task_pick ON chat_room_agent_task(status, created_at ASC, id ASC);
CREATE INDEX idx_chat_agent_task_room ON chat_room_agent_task(room_id, created_at DESC, id DESC);

CREATE TABLE chat_room_agent_task_event (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    room_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_agent_event_task FOREIGN KEY (task_id) REFERENCES chat_room_agent_task(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_agent_event_room FOREIGN KEY (room_id) REFERENCES chat_room(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_agent_event_task ON chat_room_agent_task_event(task_id, created_at ASC, id ASC);

ALTER TABLE chat_message
    ADD CONSTRAINT fk_chat_message_agent_task FOREIGN KEY (agent_task_id) REFERENCES chat_room_agent_task(id) ON DELETE SET NULL;
