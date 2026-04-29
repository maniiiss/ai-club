ALTER TABLE test_plan_info
    ADD COLUMN automation_binding_id BIGINT,
    ADD COLUMN automation_target_branch VARCHAR(100),
    ADD COLUMN last_automation_task_id BIGINT,
    ADD COLUMN last_automation_run_id BIGINT,
    ADD COLUMN last_automation_status VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    ADD COLUMN last_automation_summary VARCHAR(1000),
    ADD COLUMN last_automation_at TIMESTAMP,
    ADD COLUMN last_automation_mr_url VARCHAR(500);

ALTER TABLE test_plan_info
    ADD CONSTRAINT fk_test_plan_automation_binding
        FOREIGN KEY (automation_binding_id) REFERENCES project_gitlab_binding(id) ON DELETE SET NULL;

ALTER TABLE test_case_info
    ADD COLUMN automation_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN automation_hint VARCHAR(2000) NOT NULL DEFAULT '';

CREATE INDEX idx_test_plan_automation_binding_id ON test_plan_info(automation_binding_id);
