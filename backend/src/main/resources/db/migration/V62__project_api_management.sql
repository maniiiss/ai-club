-- 项目级 API 管理一期：补充接口文档、环境、调试记录与 OpenAPI 导入导出能力。

CREATE TABLE project_api_profile (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    description VARCHAR(1000) NOT NULL DEFAULT '',
    version VARCHAR(60) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_api_profile_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_project_api_profile_project UNIQUE (project_id)
);

CREATE TABLE project_api_folder (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    parent_folder_id BIGINT,
    name VARCHAR(120) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_api_folder_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_api_folder_parent FOREIGN KEY (parent_folder_id) REFERENCES project_api_folder(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_api_folder_project_sort
    ON project_api_folder(project_id, sort_order ASC, id ASC);

CREATE INDEX idx_project_api_folder_parent_sort
    ON project_api_folder(parent_folder_id, sort_order ASC, id ASC);

CREATE TABLE project_api_endpoint (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    folder_id BIGINT,
    name VARCHAR(160) NOT NULL,
    method VARCHAR(12) NOT NULL,
    path VARCHAR(500) NOT NULL,
    summary VARCHAR(200) NOT NULL DEFAULT '',
    description_markdown TEXT NOT NULL DEFAULT '',
    request_content_type VARCHAR(120) NOT NULL DEFAULT 'none',
    path_params_json TEXT NOT NULL DEFAULT '[]',
    query_params_json TEXT NOT NULL DEFAULT '[]',
    header_params_json TEXT NOT NULL DEFAULT '[]',
    body_example_text TEXT NOT NULL DEFAULT '',
    response_examples_json TEXT NOT NULL DEFAULT '[]',
    debug_config_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_api_endpoint_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_api_endpoint_folder FOREIGN KEY (folder_id) REFERENCES project_api_folder(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_api_endpoint_project_folder
    ON project_api_endpoint(project_id, folder_id, id ASC);

CREATE INDEX idx_project_api_endpoint_project_method_path
    ON project_api_endpoint(project_id, method, path);

CREATE TABLE project_api_environment (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    base_url VARCHAR(500) NOT NULL DEFAULT '',
    variables_json TEXT NOT NULL DEFAULT '{}',
    auth_type VARCHAR(30) NOT NULL DEFAULT 'NONE',
    auth_config_json TEXT NOT NULL DEFAULT '{}',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_api_environment_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_api_environment_project_default
    ON project_api_environment(project_id, is_default DESC, id ASC);

CREATE TABLE project_api_debug_record (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    endpoint_id BIGINT,
    environment_id BIGINT,
    request_snapshot_json TEXT NOT NULL DEFAULT '{}',
    response_snapshot_json TEXT NOT NULL DEFAULT '{}',
    duration_millis BIGINT NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT NOT NULL DEFAULT '',
    creator_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_api_debug_record_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_api_debug_record_endpoint FOREIGN KEY (endpoint_id) REFERENCES project_api_endpoint(id) ON DELETE SET NULL,
    CONSTRAINT fk_project_api_debug_record_environment FOREIGN KEY (environment_id) REFERENCES project_api_environment(id) ON DELETE SET NULL,
    CONSTRAINT fk_project_api_debug_record_creator FOREIGN KEY (creator_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_api_debug_record_project_created
    ON project_api_debug_record(project_id, created_at DESC, id DESC);

CREATE INDEX idx_project_api_debug_record_endpoint_created
    ON project_api_debug_record(endpoint_id, created_at DESC, id DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'API 管理查看', 'api:view', 'ACTION', NULL, NULL, '', NULL, 130, TRUE, TRUE, '查看项目级 API 文档、环境和调试记录'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'api:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'API 管理维护', 'api:manage', 'ACTION', NULL, NULL, '', NULL, 131, TRUE, TRUE, '维护项目级 API 文档、环境并发起调试请求'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'api:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, target_permission.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'project:view'
JOIN permission_info AS target_permission ON target_permission.code = 'api:view'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = target_permission.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, target_permission.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'project:manage'
JOIN permission_info AS target_permission ON target_permission.code = 'api:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = target_permission.id
  );
