CREATE TABLE IF NOT EXISTS test_plan_gitee_binding (
    id BIGSERIAL PRIMARY KEY,
    test_plan_id BIGINT NOT NULL UNIQUE,
    project_id BIGINT NOT NULL,
    iteration_id BIGINT NOT NULL,
    enterprise_id BIGINT NOT NULL,
    gitee_program_id BIGINT NOT NULL,
    gitee_milestone_id BIGINT NOT NULL,
    gitee_test_plan_id BIGINT NOT NULL,
    last_push_status VARCHAR(30),
    last_push_message VARCHAR(1000),
    last_pushed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_test_plan_gitee_binding_test_plan
        FOREIGN KEY (test_plan_id) REFERENCES test_plan_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_plan_gitee_binding_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_plan_gitee_binding_iteration
        FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_test_plan_gitee_binding_remote_plan
        UNIQUE (enterprise_id, gitee_test_plan_id)
);

CREATE INDEX IF NOT EXISTS idx_test_plan_gitee_binding_project_id
    ON test_plan_gitee_binding(project_id);

CREATE INDEX IF NOT EXISTS idx_test_plan_gitee_binding_iteration_id
    ON test_plan_gitee_binding(iteration_id);

CREATE TABLE IF NOT EXISTS test_case_gitee_binding (
    id BIGSERIAL PRIMARY KEY,
    test_case_id BIGINT NOT NULL UNIQUE,
    test_plan_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    iteration_id BIGINT NOT NULL,
    enterprise_id BIGINT NOT NULL,
    gitee_program_id BIGINT NOT NULL,
    gitee_test_plan_id BIGINT NOT NULL,
    gitee_test_case_id BIGINT NOT NULL,
    last_pushed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_test_case_gitee_binding_test_case
        FOREIGN KEY (test_case_id) REFERENCES test_case_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_case_gitee_binding_test_plan
        FOREIGN KEY (test_plan_id) REFERENCES test_plan_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_case_gitee_binding_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_case_gitee_binding_iteration
        FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_test_case_gitee_binding_remote_case
        UNIQUE (enterprise_id, gitee_test_case_id)
);

CREATE INDEX IF NOT EXISTS idx_test_case_gitee_binding_test_plan_id
    ON test_case_gitee_binding(test_plan_id);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Gitee 测试推送', 'gitee:test:push', 'ACTION', NULL, NULL, '', NULL, 74, TRUE, TRUE, '推送测试计划与测试用例到 Gitee'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'gitee:test:push'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'gitee:test:push'
WHERE role_info.built_in = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel rel
      WHERE rel.role_id = role_info.id
        AND rel.permission_id = permission_info.id
  );
