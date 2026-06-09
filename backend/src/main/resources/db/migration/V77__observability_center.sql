-- 可观测性中心一期：应用日志、健康检查、项目级观测入口与权限。

ALTER TABLE project_runtime_instance
    ADD COLUMN IF NOT EXISTS last_log_collected_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_log_collect_status VARCHAR(30),
    ADD COLUMN IF NOT EXISTS last_log_collect_message VARCHAR(500),
    ADD COLUMN IF NOT EXISTS last_health_checked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_health_score INTEGER,
    ADD COLUMN IF NOT EXISTS last_health_level VARCHAR(30),
    ADD COLUMN IF NOT EXISTS last_health_message VARCHAR(500),
    ADD COLUMN IF NOT EXISTS last_health_latency_ms BIGINT;

CREATE TABLE IF NOT EXISTS project_runtime_log (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    runtime_instance_id BIGINT NOT NULL,
    server_id BIGINT,
    source_type VARCHAR(20) NOT NULL,
    source_path VARCHAR(500),
    log_level VARCHAR(20),
    logger VARCHAR(255),
    trace_id VARCHAR(120),
    message TEXT NOT NULL,
    raw TEXT,
    logged_at TIMESTAMP NOT NULL,
    collected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_runtime_log_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_runtime_log_runtime_instance
        FOREIGN KEY (runtime_instance_id) REFERENCES project_runtime_instance(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_runtime_log_server
        FOREIGN KEY (server_id) REFERENCES server_info(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_project_runtime_log_project_logged_at
    ON project_runtime_log(project_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_runtime_log_runtime_logged_at
    ON project_runtime_log(runtime_instance_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_runtime_log_trace_id
    ON project_runtime_log(trace_id);

CREATE TABLE IF NOT EXISTS project_log_cursor (
    id BIGSERIAL PRIMARY KEY,
    runtime_instance_id BIGINT NOT NULL,
    source_path VARCHAR(500) NOT NULL,
    byte_offset BIGINT NOT NULL DEFAULT 0,
    last_modified_epoch_seconds BIGINT,
    last_file_size BIGINT,
    last_head_hash VARCHAR(64),
    pending_text TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_log_cursor_runtime_instance
        FOREIGN KEY (runtime_instance_id) REFERENCES project_runtime_instance(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_project_log_cursor_runtime_path
    ON project_log_cursor(runtime_instance_id, source_path);

CREATE TABLE IF NOT EXISTS project_health_snapshot (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    runtime_instance_id BIGINT NOT NULL,
    probe_type VARCHAR(20) NOT NULL,
    probe_target VARCHAR(500) NOT NULL,
    availability_status VARCHAR(30) NOT NULL,
    http_status INTEGER,
    latency_ms BIGINT,
    health_score INTEGER NOT NULL,
    health_level VARCHAR(30) NOT NULL,
    failure_reason VARCHAR(500),
    sampled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_health_snapshot_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_health_snapshot_runtime_instance
        FOREIGN KEY (runtime_instance_id) REFERENCES project_runtime_instance(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_health_snapshot_project_sampled_at
    ON project_health_snapshot(project_id, sampled_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_health_snapshot_runtime_sampled_at
    ON project_health_snapshot(runtime_instance_id, sampled_at DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '可观测性中心', 'observability:view', 'MENU', '/observability', 'ObservabilityProjectListView', 'DataAnalysis', NULL, 124, TRUE, TRUE, '查看项目应用日志、健康状态和观测中心入口'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'observability:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '可观测性维护', 'observability:manage', 'ACTION', NULL, NULL, '', NULL, 125, TRUE, TRUE, '维护项目运行实例的观测配置并管理应用日志采集'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'observability:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'cicd:view'
JOIN permission_info ON permission_info.code = 'observability:view'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'cicd:manage'
JOIN permission_info ON permission_info.code = 'observability:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
