-- Hermes 云端会话记录与多会话管理支持。

CREATE TABLE hermes_conversation_session (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    title_customized BOOLEAN NOT NULL DEFAULT FALSE,
    client_conversation_id VARCHAR(120) NOT NULL,
    route_name VARCHAR(80) NOT NULL,
    project_id BIGINT,
    task_id BIGINT,
    iteration_id BIGINT,
    plan_id BIGINT,
    latest_preview VARCHAR(500) NOT NULL DEFAULT '',
    latest_display_state_json TEXT NOT NULL DEFAULT '{}',
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hermes_conversation_session_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_hermes_conversation_session_user_conversation UNIQUE (user_id, client_conversation_id)
);

CREATE TABLE hermes_conversation_message (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'DONE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hermes_conversation_message_session FOREIGN KEY (session_id) REFERENCES hermes_conversation_session(id) ON DELETE CASCADE
);

CREATE INDEX idx_hermes_conversation_session_user_archived_last_message
    ON hermes_conversation_session(user_id, archived, last_message_at DESC, id DESC);

CREATE INDEX idx_hermes_conversation_session_user_updated_at
    ON hermes_conversation_session(user_id, updated_at DESC, id DESC);

CREATE INDEX idx_hermes_conversation_message_session_created_at
    ON hermes_conversation_message(session_id, created_at ASC, id ASC);
