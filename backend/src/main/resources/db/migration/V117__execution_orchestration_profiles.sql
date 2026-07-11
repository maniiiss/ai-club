-- 双端执行编排预设：平台默认、项目完整覆盖和草稿发布版本。

CREATE TABLE execution_orchestration_profile (
    id BIGSERIAL PRIMARY KEY,
    scope_type VARCHAR(20) NOT NULL,
    project_id BIGINT,
    scenario_code VARCHAR(50) NOT NULL,
    draft_version_id BIGINT,
    published_version_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_orchestration_profile_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT ck_execution_orchestration_profile_scope CHECK (
        (scope_type = 'PLATFORM' AND project_id IS NULL) OR (scope_type = 'PROJECT' AND project_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uk_execution_orchestration_platform_profile
    ON execution_orchestration_profile(scope_type, scenario_code) WHERE project_id IS NULL;
CREATE UNIQUE INDEX uk_execution_orchestration_project_profile
    ON execution_orchestration_profile(scope_type, project_id, scenario_code) WHERE project_id IS NOT NULL;

CREATE TABLE execution_orchestration_version (
    id BIGSERIAL PRIMARY KEY,
    profile_id BIGINT NOT NULL,
    version_no INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    source_version_id BIGINT,
    revision BIGINT NOT NULL DEFAULT 0,
    created_by_user_id BIGINT,
    published_by_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    CONSTRAINT fk_execution_orchestration_version_profile FOREIGN KEY (profile_id) REFERENCES execution_orchestration_profile(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_orchestration_version_source FOREIGN KEY (source_version_id) REFERENCES execution_orchestration_version(id) ON DELETE SET NULL,
    CONSTRAINT fk_execution_orchestration_version_creator FOREIGN KEY (created_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_execution_orchestration_version_publisher FOREIGN KEY (published_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_execution_orchestration_profile_version UNIQUE (profile_id, version_no)
);

ALTER TABLE execution_orchestration_profile ADD CONSTRAINT fk_execution_orchestration_profile_draft
    FOREIGN KEY (draft_version_id) REFERENCES execution_orchestration_version(id) ON DELETE SET NULL;
ALTER TABLE execution_orchestration_profile ADD CONSTRAINT fk_execution_orchestration_profile_published
    FOREIGN KEY (published_version_id) REFERENCES execution_orchestration_version(id) ON DELETE SET NULL;

CREATE TABLE execution_orchestration_step_binding (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL,
    step_code VARCHAR(50) NOT NULL,
    agent_id BIGINT,
    timeout_seconds INTEGER NOT NULL DEFAULT 600,
    agent_name_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    access_type_snapshot VARCHAR(20) NOT NULL DEFAULT '',
    runtime_type_snapshot VARCHAR(30),
    CONSTRAINT fk_execution_orchestration_step_version FOREIGN KEY (version_id) REFERENCES execution_orchestration_version(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_orchestration_step_agent FOREIGN KEY (agent_id) REFERENCES agent_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_execution_orchestration_version_step UNIQUE (version_id, step_code),
    CONSTRAINT ck_execution_orchestration_timeout CHECK (timeout_seconds BETWEEN 10 AND 7200)
);

ALTER TABLE execution_task ADD COLUMN orchestration_version_id BIGINT;
ALTER TABLE execution_task ADD CONSTRAINT fk_execution_task_orchestration_version
    FOREIGN KEY (orchestration_version_id) REFERENCES execution_orchestration_version(id) ON DELETE SET NULL;
CREATE INDEX idx_execution_task_orchestration_version ON execution_task(orchestration_version_id);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '编排管理', 'execution:orchestration:manage', 'MENU', '/execution-orchestrations', 'ExecutionOrchestrationView', 'SetUp', NULL, 45, TRUE, TRUE, '维护平台默认和项目级执行编排'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'execution:orchestration:manage');

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id FROM role_info JOIN permission_info ON permission_info.code = 'execution:orchestration:manage'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permission_rel WHERE role_id = role_info.id AND permission_id = permission_info.id);
