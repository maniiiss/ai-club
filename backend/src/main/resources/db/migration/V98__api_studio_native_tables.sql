-- 原生 API 工作台数据表
-- 设计文档：docs/api-studio-native-technical-design-v1.md
-- 新建 api_studio_* 表，取代旧 project_api_* 表和 Yaade iframe 方案

-- ============================================================
-- 1. 目录表：项目内多级目录
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_directory (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    parent_id BIGINT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_by BIGINT,
    updated_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_asd_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_asd_parent FOREIGN KEY (parent_id) REFERENCES api_studio_directory(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asd_project ON api_studio_directory (project_id);
CREATE INDEX IF NOT EXISTS idx_asd_parent ON api_studio_directory (parent_id);

-- ============================================================
-- 2. API 端点表：API 主体定义
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_endpoint (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    directory_id BIGINT,
    name VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET',
    path VARCHAR(512) NOT NULL DEFAULT '/',
    summary VARCHAR(512),
    description_markdown TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    request_body_type VARCHAR(30) NOT NULL DEFAULT 'NONE',
    request_body_schema_json TEXT,
    request_body_example TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    revision INT NOT NULL DEFAULT 1,
    created_by BIGINT,
    updated_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ase_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_ase_directory FOREIGN KEY (directory_id) REFERENCES api_studio_directory(id) ON DELETE SET NULL,
    CONSTRAINT ck_ase_method CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
    CONSTRAINT ck_ase_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'DEPRECATED')),
    CONSTRAINT ck_ase_body_type CHECK (request_body_type IN ('NONE', 'JSON', 'FORM_DATA', 'FORM_URLENCODED', 'RAW_TEXT'))
);

CREATE INDEX IF NOT EXISTS idx_ase_project ON api_studio_endpoint (project_id);
CREATE INDEX IF NOT EXISTS idx_ase_directory ON api_studio_endpoint (directory_id);
CREATE INDEX IF NOT EXISTS idx_ase_status ON api_studio_endpoint (status);
CREATE INDEX IF NOT EXISTS idx_ase_method_path ON api_studio_endpoint (project_id, method, path);

-- ============================================================
-- 3. API 参数表：Path、Query、Header、表单字段
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_endpoint_parameter (
    id BIGSERIAL PRIMARY KEY,
    endpoint_id BIGINT NOT NULL,
    location VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'STRING',
    required BOOLEAN NOT NULL DEFAULT FALSE,
    default_value TEXT,
    example_value TEXT,
    description TEXT,
    enum_json TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_asep_endpoint FOREIGN KEY (endpoint_id) REFERENCES api_studio_endpoint(id) ON DELETE CASCADE,
    CONSTRAINT ck_asep_location CHECK (location IN ('PATH', 'QUERY', 'HEADER', 'FORM_DATA', 'FORM_URLENCODED')),
    CONSTRAINT ck_asep_data_type CHECK (data_type IN ('STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'FILE'))
);

CREATE INDEX IF NOT EXISTS idx_asep_endpoint ON api_studio_endpoint_parameter (endpoint_id);

-- ============================================================
-- 4. 响应定义表：多状态码响应
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_response (
    id BIGSERIAL PRIMARY KEY,
    endpoint_id BIGINT NOT NULL,
    status_code INT NOT NULL DEFAULT 200,
    content_type VARCHAR(128) DEFAULT 'application/json',
    description TEXT,
    example_body TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_asr_endpoint FOREIGN KEY (endpoint_id) REFERENCES api_studio_endpoint(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asr_endpoint ON api_studio_response (endpoint_id);

-- ============================================================
-- 5. 响应字段树表：响应字段结构
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_response_field (
    id BIGSERIAL PRIMARY KEY,
    response_id BIGINT NOT NULL,
    parent_id BIGINT,
    name VARCHAR(255) NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'STRING',
    required BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    example_value TEXT,
    enum_json TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_asrf_response FOREIGN KEY (response_id) REFERENCES api_studio_response(id) ON DELETE CASCADE,
    CONSTRAINT fk_asrf_parent FOREIGN KEY (parent_id) REFERENCES api_studio_response_field(id) ON DELETE CASCADE,
    CONSTRAINT ck_asrf_data_type CHECK (data_type IN ('STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT'))
);

CREATE INDEX IF NOT EXISTS idx_asrf_response ON api_studio_response_field (response_id);
CREATE INDEX IF NOT EXISTS idx_asrf_parent ON api_studio_response_field (parent_id);

-- ============================================================
-- 6. 环境表：项目环境配置
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_environment (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    name VARCHAR(128) NOT NULL,
    base_url VARCHAR(1024) NOT NULL,
    common_headers_json TEXT,
    auth_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
    auth_config_json TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_by BIGINT,
    updated_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ase_env_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT ck_ase_auth_type CHECK (auth_type IN ('NONE', 'BEARER', 'API_KEY'))
);

CREATE INDEX IF NOT EXISTS idx_ase_env_project ON api_studio_environment (project_id);

-- ============================================================
-- 7. 环境变量表
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_environment_variable (
    id BIGSERIAL PRIMARY KEY,
    environment_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    value_ciphertext TEXT,
    secret BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_asev_environment FOREIGN KEY (environment_id) REFERENCES api_studio_environment(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asev_environment ON api_studio_environment_variable (environment_id);

-- ============================================================
-- 8. 调试记录表：个人调试记录
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_debug_record (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    endpoint_id BIGINT,
    environment_id BIGINT,
    creator_user_id BIGINT NOT NULL,
    request_snapshot_json TEXT,
    response_snapshot_json TEXT,
    status_code INT,
    duration_millis BIGINT,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_asdr_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_asdr_endpoint FOREIGN KEY (endpoint_id) REFERENCES api_studio_endpoint(id) ON DELETE SET NULL,
    CONSTRAINT fk_asdr_environment FOREIGN KEY (environment_id) REFERENCES api_studio_environment(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asdr_project_creator ON api_studio_debug_record (project_id, creator_user_id);
CREATE INDEX IF NOT EXISTS idx_asdr_endpoint ON api_studio_debug_record (endpoint_id);
CREATE INDEX IF NOT EXISTS idx_asdr_created ON api_studio_debug_record (created_at DESC);

-- ============================================================
-- 9. API 版本快照表
-- ============================================================
CREATE TABLE IF NOT EXISTS api_studio_endpoint_version (
    id BIGSERIAL PRIMARY KEY,
    endpoint_id BIGINT NOT NULL,
    version_no INT NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    change_summary TEXT,
    snapshot_json TEXT NOT NULL,
    creator_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_asev_version_endpoint FOREIGN KEY (endpoint_id) REFERENCES api_studio_endpoint(id) ON DELETE CASCADE,
    CONSTRAINT ck_asev_change_type CHECK (change_type IN ('CREATE', 'UPDATE', 'STATUS_CHANGE', 'ROLLBACK'))
);

CREATE INDEX IF NOT EXISTS idx_asev_endpoint ON api_studio_endpoint_version (endpoint_id);
CREATE INDEX IF NOT EXISTS idx_asev_endpoint_version ON api_studio_endpoint_version (endpoint_id, version_no DESC);
