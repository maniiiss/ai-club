-- 自升级中心：独立配置、巡检、建议与整改工作项领域。

CREATE TABLE self_upgrade_environment_profile (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    allowed_host_patterns_json TEXT NOT NULL DEFAULT '[]',
    login_script_json TEXT NOT NULL DEFAULT '[]',
    sandbox_username VARCHAR(120) NOT NULL DEFAULT '',
    sandbox_password_ciphertext TEXT,
    session_state_ciphertext TEXT,
    write_allowlist_json TEXT NOT NULL DEFAULT '[]',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_self_upgrade_environment_profile_code UNIQUE (code)
);

CREATE TABLE self_upgrade_center_config (
    id BIGINT PRIMARY KEY,
    default_environment_profile_id BIGINT,
    carrier_project_id BIGINT,
    default_repository_binding_ids_json TEXT NOT NULL DEFAULT '[]',
    development_plan_agent_id BIGINT,
    development_implement_agent_id BIGINT,
    development_test_agent_id BIGINT,
    development_report_agent_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_center_config_env FOREIGN KEY (default_environment_profile_id) REFERENCES self_upgrade_environment_profile(id),
    CONSTRAINT fk_self_upgrade_center_config_project FOREIGN KEY (carrier_project_id) REFERENCES project_info(id),
    CONSTRAINT fk_self_upgrade_center_config_dev_plan_agent FOREIGN KEY (development_plan_agent_id) REFERENCES agent_info(id),
    CONSTRAINT fk_self_upgrade_center_config_dev_impl_agent FOREIGN KEY (development_implement_agent_id) REFERENCES agent_info(id),
    CONSTRAINT fk_self_upgrade_center_config_dev_test_agent FOREIGN KEY (development_test_agent_id) REFERENCES agent_info(id),
    CONSTRAINT fk_self_upgrade_center_config_dev_report_agent FOREIGN KEY (development_report_agent_id) REFERENCES agent_info(id)
);

CREATE TABLE self_upgrade_patrol_plan (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    environment_profile_id BIGINT NOT NULL,
    ai_model_config_id BIGINT NOT NULL,
    scheduler_cron VARCHAR(100),
    scheduler_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    max_exploration_steps INTEGER NOT NULL DEFAULT 25,
    target_timeout_seconds INTEGER NOT NULL DEFAULT 600,
    run_timeout_seconds INTEGER NOT NULL DEFAULT 1800,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_run_status VARCHAR(30),
    last_run_message VARCHAR(1000),
    last_run_at TIMESTAMP,
    last_scheduled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_patrol_plan_env FOREIGN KEY (environment_profile_id) REFERENCES self_upgrade_environment_profile(id),
    CONSTRAINT fk_self_upgrade_patrol_plan_model FOREIGN KEY (ai_model_config_id) REFERENCES ai_model_config(id)
);

CREATE TABLE self_upgrade_patrol_target (
    id BIGSERIAL PRIMARY KEY,
    plan_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    seed_url VARCHAR(500) NOT NULL,
    goal_prompt TEXT NOT NULL DEFAULT '',
    ready_selector VARCHAR(300),
    allow_write BOOLEAN NOT NULL DEFAULT FALSE,
    write_allowlist_override_json TEXT NOT NULL DEFAULT '[]',
    max_steps_override INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_patrol_target_plan FOREIGN KEY (plan_id) REFERENCES self_upgrade_patrol_plan(id) ON DELETE CASCADE
);

CREATE TABLE self_upgrade_patrol_run (
    id BIGSERIAL PRIMARY KEY,
    plan_id BIGINT NOT NULL,
    environment_profile_id BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL,
    trigger_mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    linked_execution_task_id BIGINT,
    total_target_count INTEGER NOT NULL DEFAULT 0,
    success_target_count INTEGER NOT NULL DEFAULT 0,
    partial_success_target_count INTEGER NOT NULL DEFAULT 0,
    failed_target_count INTEGER NOT NULL DEFAULT 0,
    suggestion_count INTEGER NOT NULL DEFAULT 0,
    opened_suggestion_count INTEGER NOT NULL DEFAULT 0,
    reopened_suggestion_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    created_by_user_id BIGINT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_patrol_run_plan FOREIGN KEY (plan_id) REFERENCES self_upgrade_patrol_plan(id),
    CONSTRAINT fk_self_upgrade_patrol_run_env FOREIGN KEY (environment_profile_id) REFERENCES self_upgrade_environment_profile(id),
    CONSTRAINT fk_self_upgrade_patrol_run_execution_task FOREIGN KEY (linked_execution_task_id) REFERENCES execution_task(id),
    CONSTRAINT fk_self_upgrade_patrol_run_user FOREIGN KEY (created_by_user_id) REFERENCES user_info(id)
);

CREATE TABLE self_upgrade_patrol_run_target (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL,
    plan_target_id BIGINT,
    target_name VARCHAR(120) NOT NULL,
    seed_url VARCHAR(500) NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL,
    page_path VARCHAR(500),
    step_count INTEGER NOT NULL DEFAULT 0,
    finding_count INTEGER NOT NULL DEFAULT 0,
    skipped_guardrail_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_patrol_run_target_run FOREIGN KEY (run_id) REFERENCES self_upgrade_patrol_run(id) ON DELETE CASCADE,
    CONSTRAINT fk_self_upgrade_patrol_run_target_target FOREIGN KEY (plan_target_id) REFERENCES self_upgrade_patrol_target(id)
);

CREATE TABLE self_upgrade_suggestion (
    id BIGSERIAL PRIMARY KEY,
    fingerprint VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(60) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 1,
    reopen_count INTEGER NOT NULL DEFAULT 0,
    first_found_at TIMESTAMP NOT NULL,
    last_found_at TIMESTAMP NOT NULL,
    latest_summary TEXT NOT NULL DEFAULT '',
    latest_evidence_markdown TEXT NOT NULL DEFAULT '',
    latest_run_id BIGINT,
    latest_target_id BIGINT,
    linked_work_item_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_self_upgrade_suggestion_fingerprint UNIQUE (fingerprint)
);

CREATE TABLE self_upgrade_suggestion_occurrence (
    id BIGSERIAL PRIMARY KEY,
    suggestion_id BIGINT NOT NULL,
    run_id BIGINT NOT NULL,
    run_target_id BIGINT,
    found_at TIMESTAMP NOT NULL,
    evidence_markdown TEXT NOT NULL DEFAULT '',
    execution_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    page_path VARCHAR(500),
    dom_hint_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_suggestion_occurrence_suggestion FOREIGN KEY (suggestion_id) REFERENCES self_upgrade_suggestion(id) ON DELETE CASCADE,
    CONSTRAINT fk_self_upgrade_suggestion_occurrence_run FOREIGN KEY (run_id) REFERENCES self_upgrade_patrol_run(id) ON DELETE CASCADE,
    CONSTRAINT fk_self_upgrade_suggestion_occurrence_target FOREIGN KEY (run_target_id) REFERENCES self_upgrade_patrol_run_target(id)
);

CREATE TABLE self_upgrade_work_item (
    id BIGSERIAL PRIMARY KEY,
    suggestion_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    assignee_user_id BIGINT,
    repository_bindings_json TEXT NOT NULL DEFAULT '[]',
    execution_prompt TEXT NOT NULL DEFAULT '',
    latest_execution_task_id BIGINT,
    accepted_by_user_id BIGINT,
    accepted_at TIMESTAMP,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_upgrade_work_item_suggestion FOREIGN KEY (suggestion_id) REFERENCES self_upgrade_suggestion(id) ON DELETE CASCADE,
    CONSTRAINT fk_self_upgrade_work_item_assignee FOREIGN KEY (assignee_user_id) REFERENCES user_info(id),
    CONSTRAINT fk_self_upgrade_work_item_execution_task FOREIGN KEY (latest_execution_task_id) REFERENCES execution_task(id),
    CONSTRAINT fk_self_upgrade_work_item_accepted_user FOREIGN KEY (accepted_by_user_id) REFERENCES user_info(id)
);

ALTER TABLE self_upgrade_suggestion
    ADD CONSTRAINT fk_self_upgrade_suggestion_latest_run FOREIGN KEY (latest_run_id) REFERENCES self_upgrade_patrol_run(id);

ALTER TABLE self_upgrade_suggestion
    ADD CONSTRAINT fk_self_upgrade_suggestion_latest_target FOREIGN KEY (latest_target_id) REFERENCES self_upgrade_patrol_run_target(id);

ALTER TABLE self_upgrade_suggestion
    ADD CONSTRAINT fk_self_upgrade_suggestion_work_item FOREIGN KEY (linked_work_item_id) REFERENCES self_upgrade_work_item(id);

CREATE INDEX idx_self_upgrade_patrol_plan_enabled
    ON self_upgrade_patrol_plan(enabled, scheduler_enabled);

CREATE INDEX idx_self_upgrade_patrol_target_plan
    ON self_upgrade_patrol_target(plan_id, sort_order);

CREATE INDEX idx_self_upgrade_patrol_run_plan
    ON self_upgrade_patrol_run(plan_id, created_at DESC);

CREATE INDEX idx_self_upgrade_patrol_run_status
    ON self_upgrade_patrol_run(status, created_at DESC);

CREATE INDEX idx_self_upgrade_patrol_run_target_run
    ON self_upgrade_patrol_run_target(run_id, id);

CREATE INDEX idx_self_upgrade_suggestion_status
    ON self_upgrade_suggestion(status, last_found_at DESC);

CREATE INDEX idx_self_upgrade_occurrence_suggestion
    ON self_upgrade_suggestion_occurrence(suggestion_id, found_at DESC);

CREATE INDEX idx_self_upgrade_work_item_suggestion
    ON self_upgrade_work_item(suggestion_id, created_at DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级中心', 'self-upgrade:view', 'MENU', '/self-upgrade', 'SelfUpgradeCenterView', 'Opportunity', NULL, 45, TRUE, TRUE, '查看平台自升级中心'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级配置维护', 'self-upgrade:config:manage', 'ACTION', NULL, NULL, '', NULL, 46, TRUE, TRUE, '维护自升级中心配置与环境档案'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:config:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级计划维护', 'self-upgrade:plan:manage', 'ACTION', NULL, NULL, '', NULL, 47, TRUE, TRUE, '维护巡检计划与探索目标'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:plan:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级运行管理', 'self-upgrade:run:manage', 'ACTION', NULL, NULL, '', NULL, 48, TRUE, TRUE, '查看巡检运行详情并触发立即执行'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:run:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级建议维护', 'self-upgrade:suggestion:manage', 'ACTION', NULL, NULL, '', NULL, 49, TRUE, TRUE, '接受、拒绝与查看优化建议'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:suggestion:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级工作项维护', 'self-upgrade:work-item:manage', 'ACTION', NULL, NULL, '', NULL, 50, TRUE, TRUE, '维护整改工作项状态与内容'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:work-item:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '自升级执行发起', 'self-upgrade:execution:start', 'ACTION', NULL, NULL, '', NULL, 51, TRUE, TRUE, '手动发起巡检或整改执行'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'self-upgrade:execution:start'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN (
    'self-upgrade:view',
    'self-upgrade:config:manage',
    'self-upgrade:plan:manage',
    'self-upgrade:run:manage',
    'self-upgrade:suggestion:manage',
    'self-upgrade:work-item:manage',
    'self-upgrade:execution:start'
)
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO user_info (username, password_hash, nickname, email, phone, gitlab_username, enabled, built_in)
SELECT
    'self-upgrade-bot',
    '$2b$12$TilGx3ZtM6Hsy8lOeoFue.o8/2XKVw9mHgC1AejUTpMTTG8Is2W4e',
    '自升级机器人',
    'self-upgrade-bot@example.com',
    '',
    'self-upgrade-bot',
    FALSE,
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM user_info WHERE lower(username) = 'self-upgrade-bot'
);

INSERT INTO user_role_rel (user_id, role_id)
SELECT user_info.id, role_info.id
FROM user_info
JOIN role_info ON role_info.code = 'SUPER_ADMIN'
WHERE lower(user_info.username) = 'self-upgrade-bot'
  AND NOT EXISTS (
      SELECT 1
      FROM user_role_rel existing_rel
      WHERE existing_rel.user_id = user_info.id
        AND existing_rel.role_id = role_info.id
  );

INSERT INTO self_upgrade_environment_profile (
    code,
    name,
    base_url,
    allowed_host_patterns_json,
    login_script_json,
    sandbox_username,
    write_allowlist_json,
    enabled
)
SELECT
    'STAGING',
    '默认 STAGING 环境',
    'https://staging.example.com',
    '["staging.example.com"]',
    '[]',
    '',
    '[]',
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM self_upgrade_environment_profile WHERE code = 'STAGING'
);

INSERT INTO self_upgrade_center_config (
    id,
    default_environment_profile_id,
    carrier_project_id,
    default_repository_binding_ids_json,
    development_plan_agent_id,
    development_implement_agent_id,
    development_test_agent_id,
    development_report_agent_id
)
SELECT
    1,
    env.id,
    NULL,
    '[]',
    NULL,
    NULL,
    NULL,
    NULL
FROM self_upgrade_environment_profile env
WHERE env.code = 'STAGING'
  AND NOT EXISTS (
      SELECT 1 FROM self_upgrade_center_config WHERE id = 1
  );
