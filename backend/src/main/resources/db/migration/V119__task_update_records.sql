-- 工作项变更历史：保存按业务动作聚合的记录及字段级前后值快照。
CREATE TABLE task_update_record (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    operator_user_id BIGINT,
    operator_name_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    source VARCHAR(20) NOT NULL,
    action_type VARCHAR(30) NOT NULL,
    summary VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_update_record_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_update_record_operator FOREIGN KEY (operator_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT ck_task_update_record_source CHECK (source IN ('MANUAL', 'SYSTEM', 'AI')),
    CONSTRAINT ck_task_update_record_action CHECK (action_type IN ('CREATE', 'UPDATE', 'RELATION', 'ATTACHMENT', 'COMMENT'))
);

CREATE INDEX idx_task_update_record_task_time
    ON task_update_record(task_id, created_at DESC, id DESC);

CREATE INDEX idx_task_update_record_source
    ON task_update_record(source, created_at DESC);

CREATE TABLE task_update_record_detail (
    id BIGSERIAL PRIMARY KEY,
    record_id BIGINT NOT NULL,
    field_code VARCHAR(100) NOT NULL,
    field_name VARCHAR(120) NOT NULL DEFAULT '',
    detail_type VARCHAR(30) NOT NULL DEFAULT 'FIELD',
    old_value TEXT,
    new_value TEXT,
    related_object_id BIGINT,
    related_object_name_snapshot VARCHAR(255),
    CONSTRAINT fk_task_update_record_detail_record FOREIGN KEY (record_id) REFERENCES task_update_record(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_update_record_detail_record
    ON task_update_record_detail(record_id, id ASC);

