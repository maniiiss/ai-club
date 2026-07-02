-- DataWorkbench v1：数据工作台实体配置、DataChange 工单与执行审计。

CREATE TABLE data_workbench_entity (
    id BIGSERIAL PRIMARY KEY,
    entity_code VARCHAR(80) NOT NULL UNIQUE,
    entity_name VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    table_name VARCHAR(120) NOT NULL,
    primary_key_column VARCHAR(80) NOT NULL DEFAULT 'id',
    project_id_column VARCHAR(80) NOT NULL,
    max_affected_rows INTEGER NOT NULL DEFAULT 1,
    request_scope VARCHAR(30) NOT NULL DEFAULT 'PROJECT_PARTICIPANT',
    execute_scope VARCHAR(30) NOT NULL DEFAULT 'OWNER_OR_CREATOR',
    rollback_scope VARCHAR(30) NOT NULL DEFAULT 'OWNER_OR_CREATOR',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_workbench_field (
    id BIGSERIAL PRIMARY KEY,
    entity_id BIGINT NOT NULL,
    field_code VARCHAR(80) NOT NULL,
    field_name VARCHAR(120) NOT NULL,
    column_name VARCHAR(80) NOT NULL,
    data_type VARCHAR(40) NOT NULL DEFAULT 'STRING',
    synonyms VARCHAR(1000) NOT NULL DEFAULT '',
    updatable BOOLEAN NOT NULL DEFAULT FALSE,
    locator BOOLEAN NOT NULL DEFAULT FALSE,
    sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_data_workbench_field_entity FOREIGN KEY (entity_id) REFERENCES data_workbench_entity(id) ON DELETE CASCADE,
    CONSTRAINT uk_data_workbench_field_code UNIQUE (entity_id, field_code),
    CONSTRAINT uk_data_workbench_field_column UNIQUE (entity_id, column_name)
);

CREATE TABLE data_change_request (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    entity_id BIGINT NOT NULL,
    requester_user_id BIGINT,
    approver_user_id BIGINT,
    executor_user_id BIGINT,
    rollback_user_id BIGINT,
    original_text TEXT NOT NULL,
    dsl_json TEXT NOT NULL DEFAULT '{}',
    preview_sql_summary TEXT NOT NULL DEFAULT '',
    risk_level VARCHAR(20) NOT NULL DEFAULT 'LOW',
    approval_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
    execution_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    rollback_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
    affected_rows INTEGER NOT NULL DEFAULT 0,
    risk_reasons TEXT NOT NULL DEFAULT '',
    reject_reason VARCHAR(1000) NOT NULL DEFAULT '',
    rollback_conflict_reason VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    executed_at TIMESTAMP,
    rolled_back_at TIMESTAMP,
    CONSTRAINT fk_data_change_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_data_change_entity FOREIGN KEY (entity_id) REFERENCES data_workbench_entity(id) ON DELETE RESTRICT,
    CONSTRAINT fk_data_change_requester FOREIGN KEY (requester_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_data_change_approver FOREIGN KEY (approver_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_data_change_executor FOREIGN KEY (executor_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_data_change_rollback_user FOREIGN KEY (rollback_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE data_change_audit (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    entity_id BIGINT NOT NULL,
    primary_key_value VARCHAR(120) NOT NULL,
    before_snapshot TEXT NOT NULL,
    after_snapshot TEXT NOT NULL,
    sql_summary TEXT NOT NULL DEFAULT '',
    rollback_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
    rollback_conflict_reason VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP,
    CONSTRAINT fk_data_change_audit_request FOREIGN KEY (request_id) REFERENCES data_change_request(id) ON DELETE CASCADE,
    CONSTRAINT fk_data_change_audit_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_data_change_audit_entity FOREIGN KEY (entity_id) REFERENCES data_workbench_entity(id) ON DELETE RESTRICT
);

CREATE INDEX idx_data_workbench_field_entity ON data_workbench_field(entity_id);
CREATE INDEX idx_data_change_request_project ON data_change_request(project_id, created_at DESC);
CREATE INDEX idx_data_change_request_status ON data_change_request(approval_status, execution_status, created_at DESC);
CREATE INDEX idx_data_change_audit_request ON data_change_audit(request_id);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据工作台', 'data-workbench:view', 'MENU', '/data-workbench', 'DataWorkbenchView', 'DataAnalysis', NULL, 125, TRUE, TRUE, '查看数据工作台与数据变更记录'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:view');

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据变更申请', 'data-workbench:request', 'ACTION', NULL, NULL, '', NULL, 126, TRUE, TRUE, '在项目内提交数据变更申请'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:request');

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据变更审批', 'data-workbench:approve', 'ACTION', NULL, NULL, '', NULL, 127, TRUE, TRUE, '审批或驳回数据变更申请'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:approve');

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据变更执行', 'data-workbench:execute', 'ACTION', NULL, NULL, '', NULL, 128, TRUE, TRUE, '执行已通过校验的数据变更'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:execute');

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据变更回滚', 'data-workbench:rollback', 'ACTION', NULL, NULL, '', NULL, 129, TRUE, TRUE, '按审计快照回滚数据变更'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:rollback');

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据工作台配置', 'data-workbench:config', 'ACTION', NULL, NULL, '', NULL, 130, TRUE, TRUE, '维护 DataWorkbench 实体、字段和执行策略'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:config');

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN (
    'data-workbench:view',
    'data-workbench:request',
    'data-workbench:approve',
    'data-workbench:execute',
    'data-workbench:rollback',
    'data-workbench:config'
)
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1 FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN ('data-workbench:view', 'data-workbench:request')
WHERE role_info.code = 'PUBLIC_DEFAULT'
  AND NOT EXISTS (
      SELECT 1 FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id
        AND existing_rel.permission_id = permission_info.id
  );
