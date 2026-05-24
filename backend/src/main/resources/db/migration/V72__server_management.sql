-- 服务器管理：平台级 Linux 服务器接入、资源监控、SSH 终端与告警配置。

CREATE TABLE IF NOT EXISTS server_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username VARCHAR(120) NOT NULL,
    os_type VARCHAR(30) NOT NULL DEFAULT 'LINUX',
    auth_type VARCHAR(30) NOT NULL DEFAULT 'PASSWORD',
    password_ciphertext TEXT,
    private_key_ciphertext TEXT,
    private_key_passphrase_ciphertext TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    jump_host_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    jump_host VARCHAR(255),
    jump_port INTEGER,
    jump_username VARCHAR(120),
    jump_auth_type VARCHAR(30),
    jump_password_ciphertext TEXT,
    jump_private_key_ciphertext TEXT,
    jump_private_key_passphrase_ciphertext TEXT,
    connectivity_alert_enabled_override BOOLEAN,
    cpu_threshold_percent_override INTEGER,
    memory_threshold_percent_override INTEGER,
    disk_threshold_percent_override INTEGER,
    consecutive_breaches_override INTEGER,
    cooldown_minutes_override INTEGER,
    last_probe_status VARCHAR(30),
    last_probe_message VARCHAR(500),
    last_probed_at TIMESTAMP,
    last_cpu_usage_percent INTEGER,
    last_memory_usage_percent INTEGER,
    last_disk_usage_percent INTEGER,
    active_alert_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_server_info_name
    ON server_info(name);

CREATE INDEX IF NOT EXISTS idx_server_info_enabled
    ON server_info(enabled);

CREATE INDEX IF NOT EXISTS idx_server_info_last_probed_at
    ON server_info(last_probed_at);

CREATE TABLE IF NOT EXISTS server_metric_sample (
    id BIGSERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL,
    probe_status VARCHAR(30) NOT NULL,
    probe_message VARCHAR(500),
    cpu_usage_percent INTEGER,
    memory_usage_percent INTEGER,
    disk_usage_percent INTEGER,
    sampled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_server_metric_sample_server
        FOREIGN KEY (server_id) REFERENCES server_info(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_metric_sample_server_sampled_at
    ON server_metric_sample(server_id, sampled_at DESC);

CREATE TABLE IF NOT EXISTS server_alert_state (
    id BIGSERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL,
    alert_code VARCHAR(30) NOT NULL,
    alert_name VARCHAR(60) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    last_observed_value INTEGER,
    consecutive_breach_count INTEGER NOT NULL DEFAULT 0,
    last_notified_at TIMESTAMP,
    last_triggered_at TIMESTAMP,
    last_recovered_at TIMESTAMP,
    last_message VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_server_alert_state_server
        FOREIGN KEY (server_id) REFERENCES server_info(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_server_alert_state_server_code
    ON server_alert_state(server_id, alert_code);

CREATE INDEX IF NOT EXISTS idx_server_alert_state_active
    ON server_alert_state(server_id, active);

CREATE TABLE IF NOT EXISTS server_alert_recipient_rel (
    server_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id),
    CONSTRAINT fk_server_alert_recipient_server
        FOREIGN KEY (server_id) REFERENCES server_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_server_alert_recipient_user
        FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_alert_recipient_user
    ON server_alert_recipient_rel(user_id);

CREATE TABLE IF NOT EXISTS server_terminal_session_log (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    server_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    connection_status VARCHAR(30) NOT NULL,
    close_reason VARCHAR(100),
    source_ip VARCHAR(64),
    error_message VARCHAR(500),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    connected_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_server_terminal_session_server
        FOREIGN KEY (server_id) REFERENCES server_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_server_terminal_session_user
        FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_server_terminal_session_log_session_id
    ON server_terminal_session_log(session_id);

CREATE INDEX IF NOT EXISTS idx_server_terminal_session_log_server_started_at
    ON server_terminal_session_log(server_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_server_terminal_session_log_user_started_at
    ON server_terminal_session_log(user_id, started_at DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '服务器管理', 'server:view', 'MENU', '/servers', 'ServerManagementView', 'Connection', NULL, 121, TRUE, TRUE, '查看服务器列表、详情、资源监控与告警状态'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'server:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '服务器维护', 'server:manage', 'ACTION', NULL, NULL, '', NULL, 122, TRUE, TRUE, '维护服务器接入信息、告警配置和通知人'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'server:manage'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '服务器终端', 'server:terminal', 'ACTION', NULL, NULL, '', NULL, 123, TRUE, TRUE, '通过页面 SSH 终端连接服务器执行操作'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'server:terminal'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, permission_info.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'cicd:view'
JOIN permission_info ON permission_info.code = 'server:view'
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
JOIN permission_info ON permission_info.code = 'server:manage'
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
JOIN permission_info ON permission_info.code = 'server:terminal'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = permission_info.id
  );
