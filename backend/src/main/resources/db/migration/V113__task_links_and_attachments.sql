-- 工作项详情统一关系与附件：子工作项、普通关联工作项、测试用例关联和受控附件。

CREATE TABLE task_work_item_relation (
    id BIGSERIAL PRIMARY KEY,
    source_task_id BIGINT NOT NULL,
    target_task_id BIGINT NOT NULL,
    relation_type VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_work_item_relation_source FOREIGN KEY (source_task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_work_item_relation_target FOREIGN KEY (target_task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_task_work_item_relation UNIQUE (source_task_id, target_task_id, relation_type),
    CONSTRAINT ck_task_work_item_relation_type CHECK (relation_type IN ('CHILD', 'RELATED')),
    CONSTRAINT ck_task_work_item_relation_distinct CHECK (source_task_id <> target_task_id)
);

CREATE INDEX idx_task_work_item_relation_source
    ON task_work_item_relation(source_task_id, relation_type, created_at ASC, id ASC);

CREATE INDEX idx_task_work_item_relation_target
    ON task_work_item_relation(target_task_id, relation_type, created_at ASC, id ASC);

CREATE TABLE task_test_case_relation (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    test_case_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_test_case_relation_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_test_case_relation_case FOREIGN KEY (test_case_id) REFERENCES test_case_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_task_test_case_relation UNIQUE (task_id, test_case_id)
);

CREATE INDEX idx_task_test_case_relation_task
    ON task_test_case_relation(task_id, created_at ASC, id ASC);

CREATE INDEX idx_task_test_case_relation_case
    ON task_test_case_relation(test_case_id);

CREATE TABLE task_attachment (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    document_asset_id BIGINT NOT NULL,
    uploader_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_attachment_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_attachment_asset FOREIGN KEY (document_asset_id) REFERENCES document_asset(id) ON DELETE RESTRICT,
    CONSTRAINT fk_task_attachment_uploader FOREIGN KEY (uploader_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_task_attachment_task
    ON task_attachment(task_id, created_at ASC, id ASC);

CREATE INDEX idx_task_attachment_asset
    ON task_attachment(document_asset_id);

-- 兼容旧的单需求关联：迁移为 RELATED，按较小 ID 在 source 侧保存，避免 A-B 与 B-A 双份普通关联。
INSERT INTO task_work_item_relation (source_task_id, target_task_id, relation_type, created_at)
SELECT
    LEAST(t.id, t.requirement_task_id),
    GREATEST(t.id, t.requirement_task_id),
    'RELATED',
    CURRENT_TIMESTAMP
FROM task_info t
JOIN task_info r ON r.id = t.requirement_task_id
WHERE t.requirement_task_id IS NOT NULL
  AND t.requirement_task_id <> t.id
  AND t.project_id = r.project_id
ON CONFLICT DO NOTHING;
