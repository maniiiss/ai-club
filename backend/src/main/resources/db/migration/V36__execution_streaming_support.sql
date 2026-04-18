-- 执行中心流式执行：补充步骤聚合字段与步骤事件表。

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS runner_session_id VARCHAR(120);

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS runner_type VARCHAR(40) NOT NULL DEFAULT '';

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS current_command VARCHAR(1000) NOT NULL DEFAULT '';

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS last_event_id BIGINT;

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP;

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP;

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS tail_log_text TEXT;

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS tail_log_line_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS has_live_stream BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS execution_step_event (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL,
    step_id BIGINT NOT NULL,
    sequence_no BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    stream_kind VARCHAR(20),
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_step_event_run FOREIGN KEY (run_id) REFERENCES execution_run(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_step_event_step FOREIGN KEY (step_id) REFERENCES execution_step(id) ON DELETE CASCADE,
    CONSTRAINT uk_execution_step_event_run_seq UNIQUE (run_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_execution_step_runner_session_id ON execution_step(runner_session_id);
CREATE INDEX IF NOT EXISTS idx_execution_step_live_status ON execution_step(status, has_live_stream);
CREATE INDEX IF NOT EXISTS idx_execution_step_event_run_seq ON execution_step_event(run_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_execution_step_event_step_seq ON execution_step_event(step_id, sequence_no);
