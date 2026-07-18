-- DataWorkbench 语义查询 v1：项目私有 PostgreSQL 数据源、版本化语义模型与只读查询审计。

CREATE TABLE data_workbench_data_source (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    jdbc_url_ciphertext TEXT NOT NULL,
    username_ciphertext TEXT NOT NULL,
    password_ciphertext TEXT NOT NULL,
    allowed_schemas VARCHAR(1000) NOT NULL DEFAULT 'public',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    schema_snapshot_json TEXT NOT NULL DEFAULT '{}',
    schema_scanned_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dw_query_source_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_dw_query_source_project_name UNIQUE (project_id, name)
);

CREATE TABLE data_workbench_semantic_model (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    data_source_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    draft_definition_json TEXT NOT NULL DEFAULT '{}',
    published_definition_json TEXT NOT NULL DEFAULT '{}',
    published_schema_snapshot_json TEXT NOT NULL DEFAULT '{}',
    model_config_id BIGINT,
    model_name_snapshot VARCHAR(120) NOT NULL DEFAULT '',
    model_provider_snapshot VARCHAR(30) NOT NULL DEFAULT '',
    model_identifier_snapshot VARCHAR(120) NOT NULL DEFAULT '',
    version_no INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dw_semantic_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_dw_semantic_source FOREIGN KEY (data_source_id) REFERENCES data_workbench_data_source(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dw_semantic_model_config FOREIGN KEY (model_config_id) REFERENCES ai_model_config(id) ON DELETE SET NULL,
    CONSTRAINT uk_dw_semantic_project_name UNIQUE (project_id, name)
);

CREATE TABLE data_workbench_query_request (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    semantic_model_id BIGINT NOT NULL,
    requester_user_id BIGINT,
    original_text TEXT NOT NULL,
    interpretation_json TEXT NOT NULL DEFAULT '{}',
    dsl_json TEXT NOT NULL DEFAULT '{}',
    preview_token VARCHAR(100) NOT NULL DEFAULT '',
    sql_summary TEXT NOT NULL DEFAULT '',
    result_summary TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'INTERPRETED',
    error_message VARCHAR(1000) NOT NULL DEFAULT '',
    executed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dw_query_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_dw_query_semantic_model FOREIGN KEY (semantic_model_id) REFERENCES data_workbench_semantic_model(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dw_query_user FOREIGN KEY (requester_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_dw_query_source_project ON data_workbench_data_source(project_id);
CREATE INDEX idx_dw_semantic_project ON data_workbench_semantic_model(project_id, status);
CREATE INDEX idx_dw_query_request_project ON data_workbench_query_request(project_id, created_at DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '数据源维护', 'data-workbench:source-manage', 'ACTION', NULL, NULL, '', NULL, 131, TRUE, TRUE, '维护项目 PostgreSQL 只读数据源'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:source-manage');
INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '语义模型维护', 'data-workbench:semantic-manage', 'ACTION', NULL, NULL, '', NULL, 132, TRUE, TRUE, '维护同义词、概念、定义、枚举与策略'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:semantic-manage');
INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '语义数据查询', 'data-workbench:query', 'ACTION', NULL, NULL, '', NULL, 133, TRUE, TRUE, '执行项目内受控只读数据查询'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:query');
INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '语义查询审计', 'data-workbench:query-audit', 'ACTION', NULL, NULL, '', NULL, 134, TRUE, TRUE, '查看项目语义查询审计'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'data-workbench:query-audit');

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT r.id, p.id FROM role_info r CROSS JOIN permission_info p
WHERE r.code = 'SUPER_ADMIN' AND p.code IN ('data-workbench:source-manage', 'data-workbench:semantic-manage', 'data-workbench:query', 'data-workbench:query-audit')
  AND NOT EXISTS (SELECT 1 FROM role_permission_rel x WHERE x.role_id = r.id AND x.permission_id = p.id);
