-- 平台版本发布与用户展示状态。
-- 发布记录不可编辑；用户展示关系使用唯一约束保证关闭弹窗和重复请求均幂等。
CREATE TABLE platform_release (
    id BIGSERIAL PRIMARY KEY,
    version_code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    publisher_user_id BIGINT NOT NULL,
    published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_platform_release_publisher FOREIGN KEY (publisher_user_id) REFERENCES user_info(id) ON DELETE RESTRICT
);

CREATE TABLE platform_release_view (
    id BIGSERIAL PRIMARY KEY,
    release_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_platform_release_view_release_user UNIQUE (release_id, user_id),
    CONSTRAINT fk_platform_release_view_release FOREIGN KEY (release_id) REFERENCES platform_release(id) ON DELETE CASCADE,
    CONSTRAINT fk_platform_release_view_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE INDEX idx_platform_release_published_at ON platform_release(published_at DESC, id DESC);
CREATE INDEX idx_platform_release_view_user_id ON platform_release_view(user_id);

-- 版本发布单独出现在系统管理中，并将发布权限同步给已有用户维护权限的角色。
INSERT INTO permission_info(name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '版本发布', 'system:release:view', 'MENU', '/releases', 'PlatformReleaseView', 'Promotion', NULL, 92, TRUE, TRUE, '查看平台版本发布历史'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:release:view');

INSERT INTO permission_info(name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '版本发布维护', 'system:release:manage', 'ACTION', NULL, NULL, '', NULL, 93, TRUE, TRUE, '发布平台版本说明'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:release:manage');

INSERT INTO role_permission_rel(role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN ('system:release:view', 'system:release:manage')
WHERE role_info.code = 'SUPER_ADMIN'
   OR EXISTS (
       SELECT 1
       FROM role_permission_rel existing_rel
       JOIN permission_info user_manage_permission ON user_manage_permission.id = existing_rel.permission_id
       WHERE existing_rel.role_id = role_info.id
         AND user_manage_permission.code = 'system:user:manage'
   )
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel existing_release_rel
      WHERE existing_release_rel.role_id = role_info.id
        AND existing_release_rel.permission_id = permission_info.id
  );
