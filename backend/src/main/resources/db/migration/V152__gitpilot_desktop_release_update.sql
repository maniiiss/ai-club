-- GitPilot Desktop Windows stable 发布中心。
-- 业务意图：把桌面安装包、Tauri updater 产物和版本说明作为独立生命周期管理，
-- 不与面向公众端版本弹窗的 platform_release 混用。
CREATE TABLE desktop_release (
    id BIGSERIAL PRIMARY KEY,
    version_code VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'stable',
    title VARCHAR(200) NOT NULL,
    release_notes TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    publisher_user_id BIGINT REFERENCES user_info(id) ON DELETE SET NULL,
    published_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_desktop_release_version_channel UNIQUE (version_code, channel),
    CONSTRAINT ck_desktop_release_channel CHECK (channel IN ('stable')),
    CONSTRAINT ck_desktop_release_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'REVOKED'))
);

CREATE INDEX idx_desktop_release_channel_status_version
    ON desktop_release(channel, status, version_code);
CREATE INDEX idx_desktop_release_published_at
    ON desktop_release(published_at DESC, id DESC);

CREATE TABLE desktop_release_artifact (
    id BIGSERIAL PRIMARY KEY,
    release_id BIGINT NOT NULL REFERENCES desktop_release(id) ON DELETE CASCADE,
    artifact_kind VARCHAR(20) NOT NULL,
    platform VARCHAR(30) NOT NULL,
    arch VARCHAR(40) NOT NULL,
    bundle_type VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    object_key VARCHAR(500) NOT NULL UNIQUE,
    content_type VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
    file_size BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    signature_text TEXT NOT NULL DEFAULT '',
    download_status VARCHAR(20) NOT NULL DEFAULT 'READY',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_desktop_release_artifact_matrix UNIQUE (release_id, artifact_kind, platform, arch, bundle_type),
    CONSTRAINT ck_desktop_release_artifact_kind CHECK (artifact_kind IN ('INSTALLER', 'UPDATER', 'SIGNATURE')),
    CONSTRAINT ck_desktop_release_artifact_platform CHECK (platform IN ('windows')),
    CONSTRAINT ck_desktop_release_artifact_arch CHECK (arch IN ('x86_64')),
    CONSTRAINT ck_desktop_release_artifact_bundle CHECK (bundle_type IN ('msi', 'nsis', 'none')),
    CONSTRAINT ck_desktop_release_artifact_download_status CHECK (download_status IN ('READY', 'DISABLED'))
);

CREATE INDEX idx_desktop_release_artifact_release ON desktop_release_artifact(release_id);
CREATE INDEX idx_desktop_release_artifact_lookup
    ON desktop_release_artifact(platform, arch, bundle_type, artifact_kind);

-- 桌面发布入口独立挂在系统管理下，写操作沿用管理员角色治理。
INSERT INTO permission_info(name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '桌面版本发布', 'system:desktop-release:view', 'MENU', '/desktop-releases', 'DesktopReleaseView', 'Download', NULL, 94, TRUE, TRUE, '查看 GitPilot Desktop 版本和安装包'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:desktop-release:view');

INSERT INTO permission_info(name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '桌面版本发布维护', 'system:desktop-release:manage', 'ACTION', NULL, NULL, '', NULL, 95, TRUE, TRUE, '上传、发布和撤回 GitPilot Desktop 版本'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:desktop-release:manage');

INSERT INTO role_permission_rel(role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN ('system:desktop-release:view', 'system:desktop-release:manage')
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
