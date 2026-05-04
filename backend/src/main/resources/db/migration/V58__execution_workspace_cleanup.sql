-- 执行工作区清理登记表：为异步删除任务沉淀可重试、可追踪的工作区生命周期状态。

CREATE TABLE IF NOT EXISTS execution_workspace_cleanup (
    id BIGSERIAL PRIMARY KEY,
    execution_task_id BIGINT NOT NULL,
    execution_run_id BIGINT NOT NULL,
    execution_step_id BIGINT,
    runner_session_id VARCHAR(120),
    workspace_root VARCHAR(1000) NOT NULL,
    status VARCHAR(20) NOT NULL,
    execution_result_status VARCHAR(20),
    scheduled_at TIMESTAMP,
    expires_at TIMESTAMP,
    delete_error_message TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_execution_workspace_cleanup_task
        FOREIGN KEY (execution_task_id) REFERENCES execution_task(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_workspace_cleanup_run
        FOREIGN KEY (execution_run_id) REFERENCES execution_run(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_workspace_cleanup_step
        FOREIGN KEY (execution_step_id) REFERENCES execution_step(id) ON DELETE SET NULL,
    CONSTRAINT uk_execution_workspace_cleanup_run_root UNIQUE (execution_run_id, workspace_root)
);

CREATE INDEX IF NOT EXISTS idx_execution_workspace_cleanup_run_status
    ON execution_workspace_cleanup(execution_run_id, status, id);

CREATE INDEX IF NOT EXISTS idx_execution_workspace_cleanup_expires_at
    ON execution_workspace_cleanup(expires_at, id);
