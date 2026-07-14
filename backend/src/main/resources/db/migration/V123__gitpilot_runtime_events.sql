-- Runtime 统一事件幂等表；事件业务投影由执行中心和聊天室消费，原始事件保留用于审计与断线恢复。

CREATE TABLE runtime_event (
    event_key VARCHAR(220) PRIMARY KEY,
    run_id VARCHAR(120) NOT NULL,
    session_id VARCHAR(120) NOT NULL,
    sequence BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_runtime_event_run_sequence UNIQUE (run_id, sequence)
);

CREATE INDEX idx_runtime_event_session_created ON runtime_event(session_id, created_at ASC);
