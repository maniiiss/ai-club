-- 项目运行实例：作为日志采集和健康探测的统一目标来源。
CREATE TABLE IF NOT EXISTS project_runtime_instance (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    source_binding_id BIGINT,
    name VARCHAR(120) NOT NULL,
    environment VARCHAR(60),
    service_name VARCHAR(120),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    server_mode VARCHAR(30) NOT NULL DEFAULT 'MANAGED_SERVER',
    server_id BIGINT,
    external_base_url VARCHAR(500),
    log_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    log_paths_json TEXT NOT NULL DEFAULT '[]',
    health_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    health_probe_type VARCHAR(20),
    health_target VARCHAR(500),
    last_deployed_at TIMESTAMP,
    last_status VARCHAR(30),
    last_status_message VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_runtime_instance_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_runtime_instance_server FOREIGN KEY (server_id) REFERENCES server_info(id) ON DELETE SET NULL,
    CONSTRAINT ck_project_runtime_instance_source_type CHECK (source_type IN ('MANUAL', 'JENKINS', 'WOODPECKER')),
    CONSTRAINT ck_project_runtime_instance_server_mode CHECK (server_mode IN ('MANAGED_SERVER', 'EXTERNAL_ENDPOINT')),
    CONSTRAINT ck_project_runtime_instance_health_probe CHECK (health_probe_type IS NULL OR health_probe_type IN ('HTTP', 'TCP')),
    CONSTRAINT ck_project_runtime_instance_managed_server CHECK (
        (server_mode = 'MANAGED_SERVER' AND server_id IS NOT NULL)
        OR (server_mode = 'EXTERNAL_ENDPOINT' AND external_base_url IS NOT NULL)
    ),
    CONSTRAINT ck_project_runtime_instance_external_log CHECK (
        server_mode <> 'EXTERNAL_ENDPOINT' OR log_enabled = FALSE
    )
);

CREATE INDEX IF NOT EXISTS idx_project_runtime_instance_project_id ON project_runtime_instance(project_id);
CREATE INDEX IF NOT EXISTS idx_project_runtime_instance_source ON project_runtime_instance(source_type, source_binding_id);
CREATE INDEX IF NOT EXISTS idx_project_runtime_instance_server_id ON project_runtime_instance(server_id);
