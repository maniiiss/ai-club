-- 执行中心：任务管理页重构为智能体执行中心，并新增 Hermes / 页面统一发起所需的执行域模型。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '创建执行任务', 'task:execution:create', 'ACTION', NULL, NULL, '', NULL, 42, TRUE, TRUE, '创建并发起执行中心任务'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'task:execution:create'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '取消执行任务', 'task:execution:cancel', 'ACTION', NULL, NULL, '', NULL, 43, TRUE, TRUE, '取消执行中心任务'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'task:execution:cancel'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '重试执行任务', 'task:execution:retry', 'ACTION', NULL, NULL, '', NULL, 44, TRUE, TRUE, '重试执行中心任务'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'task:execution:retry'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS manage_permission ON manage_permission.code = 'task:manage'
JOIN permission_info ON permission_info.code = 'task:execution:create'
WHERE role_permission_rel.permission_id = manage_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS manage_permission ON manage_permission.code = 'task:manage'
JOIN permission_info ON permission_info.code = 'task:execution:cancel'
WHERE role_permission_rel.permission_id = manage_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS manage_permission ON manage_permission.code = 'task:manage'
JOIN permission_info ON permission_info.code = 'task:execution:retry'
WHERE role_permission_rel.permission_id = manage_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );

CREATE TABLE execution_task (
    id BIGSERIAL PRIMARY KEY,
    source_type VARCHAR(40) NOT NULL,
    source_id BIGINT,
    trigger_source VARCHAR(40) NOT NULL DEFAULT 'PAGE',
    scenario_code VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    project_id BIGINT NOT NULL,
    work_item_id BIGINT,
    created_by_user_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    current_run_id BIGINT,
    latest_summary VARCHAR(1000) NOT NULL DEFAULT '',
    input_payload TEXT NOT NULL DEFAULT '{}',
    agent_binding_payload TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_task_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_task_work_item FOREIGN KEY (work_item_id) REFERENCES task_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_execution_task_creator FOREIGN KEY (created_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE execution_run (
    id BIGSERIAL PRIMARY KEY,
    execution_task_id BIGINT NOT NULL,
    run_no INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    current_step_no INTEGER,
    input_snapshot TEXT NOT NULL DEFAULT '{}',
    output_summary TEXT,
    error_message TEXT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_run_task FOREIGN KEY (execution_task_id) REFERENCES execution_task(id) ON DELETE CASCADE,
    CONSTRAINT uk_execution_run_task_run_no UNIQUE (execution_task_id, run_no)
);

ALTER TABLE execution_task
ADD CONSTRAINT fk_execution_task_current_run
FOREIGN KEY (current_run_id) REFERENCES execution_run(id) ON DELETE SET NULL;

CREATE TABLE execution_step (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL,
    step_no INTEGER NOT NULL,
    step_code VARCHAR(50) NOT NULL,
    step_name VARCHAR(100) NOT NULL DEFAULT '',
    agent_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    input_snapshot TEXT NOT NULL DEFAULT '',
    output_snapshot TEXT,
    error_message TEXT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_step_run FOREIGN KEY (run_id) REFERENCES execution_run(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_step_agent FOREIGN KEY (agent_id) REFERENCES agent_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_execution_step_run_step_no UNIQUE (run_id, step_no)
);

CREATE TABLE execution_artifact (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL,
    step_id BIGINT,
    artifact_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    content_ref VARCHAR(500),
    content_text TEXT,
    work_item_writeback_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_artifact_run FOREIGN KEY (run_id) REFERENCES execution_run(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_artifact_step FOREIGN KEY (step_id) REFERENCES execution_step(id) ON DELETE SET NULL
);

CREATE INDEX idx_execution_task_project_id ON execution_task(project_id);
CREATE INDEX idx_execution_task_work_item_id ON execution_task(work_item_id);
CREATE INDEX idx_execution_task_status ON execution_task(status);
CREATE INDEX idx_execution_task_created_by_user_id ON execution_task(created_by_user_id);
CREATE INDEX idx_execution_task_created_at ON execution_task(created_at DESC);
CREATE INDEX idx_execution_run_task_id ON execution_run(execution_task_id);
CREATE INDEX idx_execution_run_status ON execution_run(status);
CREATE INDEX idx_execution_step_run_id ON execution_step(run_id);
CREATE INDEX idx_execution_step_agent_id ON execution_step(agent_id);
CREATE INDEX idx_execution_artifact_run_id ON execution_artifact(run_id);
