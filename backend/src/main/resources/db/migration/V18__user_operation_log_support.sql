-- 全系统用户操作日志：记录写操作审计轨迹，并补充后台查询入口权限。

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '操作日志', 'system:operation-log:view', 'MENU', '/operation-logs', 'OperationLogView', 'Document', NULL, 122, TRUE, TRUE, '查看系统操作日志页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:operation-log:view'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'system:operation-log:view'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );

CREATE TABLE user_operation_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    username_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    nickname_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    module_code VARCHAR(80) NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    action_code VARCHAR(120) NOT NULL,
    action_name VARCHAR(200) NOT NULL,
    biz_type VARCHAR(80),
    biz_id BIGINT,
    http_method VARCHAR(10) NOT NULL,
    request_uri VARCHAR(255) NOT NULL,
    route_pattern VARCHAR(255) NOT NULL,
    permission_code VARCHAR(100),
    operation_status VARCHAR(20) NOT NULL,
    response_status INTEGER NOT NULL,
    duration_ms BIGINT NOT NULL,
    ip_address VARCHAR(64),
    user_agent VARCHAR(1000),
    request_snapshot TEXT,
    result_message VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_operation_log_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_operation_log_created_at ON user_operation_log(created_at DESC);
CREATE INDEX idx_user_operation_log_user_id ON user_operation_log(user_id);
CREATE INDEX idx_user_operation_log_module_code ON user_operation_log(module_code);
CREATE INDEX idx_user_operation_log_operation_status ON user_operation_log(operation_status);
CREATE INDEX idx_user_operation_log_biz_type_id ON user_operation_log(biz_type, biz_id);
