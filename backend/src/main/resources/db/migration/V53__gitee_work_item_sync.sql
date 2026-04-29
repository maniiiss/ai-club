-- Gitee 项目/迭代绑定与工作项手动同步：新增绑定模型、同步日志和最小权限。

ALTER TABLE task_info
ALTER COLUMN work_item_type TYPE VARCHAR(50);

ALTER TABLE task_info
ALTER COLUMN status TYPE VARCHAR(50);

CREATE TABLE IF NOT EXISTS project_gitee_binding (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE,
    enterprise_id BIGINT NOT NULL,
    api_base_url VARCHAR(255) NOT NULL,
    access_token_ciphertext TEXT NOT NULL,
    gitee_program_id BIGINT NOT NULL,
    gitee_program_name VARCHAR(200) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_test_status VARCHAR(30),
    last_test_message VARCHAR(500),
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_project_gitee_binding_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_gitee_binding_enterprise_id
    ON project_gitee_binding(enterprise_id);

CREATE TABLE IF NOT EXISTS iteration_gitee_binding (
    id BIGSERIAL PRIMARY KEY,
    iteration_id BIGINT NOT NULL UNIQUE,
    project_id BIGINT NOT NULL,
    gitee_milestone_id BIGINT NOT NULL,
    gitee_milestone_title VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_iteration_gitee_binding_iteration
        FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_iteration_gitee_binding_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_iteration_gitee_binding_project_milestone
        UNIQUE (project_id, gitee_milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_iteration_gitee_binding_project_id
    ON iteration_gitee_binding(project_id);

CREATE TABLE IF NOT EXISTS task_gitee_binding (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL UNIQUE,
    project_id BIGINT NOT NULL,
    iteration_id BIGINT NOT NULL,
    enterprise_id BIGINT NOT NULL,
    gitee_program_id BIGINT NOT NULL,
    gitee_milestone_id BIGINT NOT NULL,
    gitee_issue_id BIGINT NOT NULL,
    gitee_issue_url VARCHAR(500),
    last_sync_status VARCHAR(30),
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_task_gitee_binding_task
        FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_gitee_binding_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_gitee_binding_iteration
        FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_task_gitee_binding_remote_issue
        UNIQUE (enterprise_id, gitee_issue_id)
);

CREATE INDEX IF NOT EXISTS idx_task_gitee_binding_iteration_id
    ON task_gitee_binding(iteration_id);

CREATE INDEX IF NOT EXISTS idx_task_gitee_binding_project_id
    ON task_gitee_binding(project_id);

CREATE TABLE IF NOT EXISTS gitee_work_item_sync_log (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    iteration_id BIGINT NOT NULL,
    enterprise_id BIGINT NOT NULL,
    gitee_program_id BIGINT NOT NULL,
    gitee_milestone_id BIGINT NOT NULL,
    execution_status VARCHAR(20) NOT NULL,
    total_issue_count INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    removed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    summary_message VARCHAR(1000) NOT NULL DEFAULT '',
    executed_by_user_id BIGINT,
    executed_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_gitee_work_item_sync_log_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_gitee_work_item_sync_log_iteration
        FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_gitee_work_item_sync_log_user
        FOREIGN KEY (executed_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gitee_work_item_sync_log_iteration_id
    ON gitee_work_item_sync_log(iteration_id, executed_at DESC, id DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Gitee 绑定维护', 'gitee:binding:manage', 'ACTION', NULL, NULL, '', NULL, 72, TRUE, TRUE, '维护 Gitee 项目与迭代绑定'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'gitee:binding:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Gitee 工作项同步', 'gitee:work-item:sync', 'ACTION', NULL, NULL, '', NULL, 73, TRUE, TRUE, '执行 Gitee 迭代工作项手动同步'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'gitee:work-item:sync'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'gitee:binding:manage'
WHERE role_info.built_in = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel rel
      WHERE rel.role_id = role_info.id
        AND rel.permission_id = permission_info.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'gitee:work-item:sync'
WHERE role_info.built_in = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel rel
      WHERE rel.role_id = role_info.id
        AND rel.permission_id = permission_info.id
  );
