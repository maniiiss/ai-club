-- AI Club Pipeline 自动化能力：Woodpecker cron、本地公开触发 webhook、外部回调 webhook 与运行快照。

CREATE TABLE IF NOT EXISTS ai_club_pipeline_cron_job (
    id BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT NOT NULL,
    woodpecker_cron_id BIGINT,
    name VARCHAR(120) NOT NULL,
    branch VARCHAR(100),
    cron_expression VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at TIMESTAMP,
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_club_pipeline_cron_pipeline FOREIGN KEY (pipeline_id) REFERENCES ai_club_pipeline(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_ai_club_pipeline_cron_pipeline_name
    ON ai_club_pipeline_cron_job(pipeline_id, name);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_cron_pipeline_id
    ON ai_club_pipeline_cron_job(pipeline_id);

CREATE TABLE IF NOT EXISTS ai_club_pipeline_trigger_webhook (
    id BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT NOT NULL,
    token_ciphertext TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_club_pipeline_trigger_webhook_pipeline FOREIGN KEY (pipeline_id) REFERENCES ai_club_pipeline(id) ON DELETE CASCADE,
    CONSTRAINT uk_ai_club_pipeline_trigger_webhook_pipeline UNIQUE (pipeline_id)
);

CREATE TABLE IF NOT EXISTS ai_club_pipeline_callback_webhook (
    id BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT NOT NULL,
    callback_url_ciphertext TEXT,
    subscribed_statuses_json TEXT NOT NULL DEFAULT '["SUCCESS","FAILED","CANCELED"]',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_delivery_at TIMESTAMP,
    last_delivery_status VARCHAR(30),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_club_pipeline_callback_webhook_pipeline FOREIGN KEY (pipeline_id) REFERENCES ai_club_pipeline(id) ON DELETE CASCADE,
    CONSTRAINT uk_ai_club_pipeline_callback_webhook_pipeline UNIQUE (pipeline_id)
);

CREATE TABLE IF NOT EXISTS ai_club_pipeline_run_snapshot (
    id BIGSERIAL PRIMARY KEY,
    pipeline_id BIGINT NOT NULL,
    run_number INTEGER NOT NULL,
    status VARCHAR(30),
    branch VARCHAR(100),
    event VARCHAR(50),
    message VARCHAR(500),
    commit_sha VARCHAR(100),
    run_url VARCHAR(500),
    trigger_source VARCHAR(100),
    created_at_remote TIMESTAMP,
    started_at_remote TIMESTAMP,
    finished_at_remote TIMESTAMP,
    last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_club_pipeline_run_snapshot_pipeline FOREIGN KEY (pipeline_id) REFERENCES ai_club_pipeline(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_ai_club_pipeline_run_snapshot_pipeline_run
    ON ai_club_pipeline_run_snapshot(pipeline_id, run_number);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_run_snapshot_pipeline_id
    ON ai_club_pipeline_run_snapshot(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_run_snapshot_status
    ON ai_club_pipeline_run_snapshot(status);

CREATE TABLE IF NOT EXISTS ai_club_pipeline_callback_delivery (
    id BIGSERIAL PRIMARY KEY,
    callback_webhook_id BIGINT NOT NULL,
    run_snapshot_id BIGINT NOT NULL,
    callback_status VARCHAR(30) NOT NULL,
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    callback_url_ciphertext TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at TIMESTAMP,
    delivered_at TIMESTAMP,
    last_error_message VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_club_pipeline_callback_delivery_webhook FOREIGN KEY (callback_webhook_id) REFERENCES ai_club_pipeline_callback_webhook(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_club_pipeline_callback_delivery_run_snapshot FOREIGN KEY (run_snapshot_id) REFERENCES ai_club_pipeline_run_snapshot(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_ai_club_pipeline_callback_delivery_run_status
    ON ai_club_pipeline_callback_delivery(run_snapshot_id, callback_status);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_callback_delivery_status
    ON ai_club_pipeline_callback_delivery(delivery_status, next_attempt_at);
