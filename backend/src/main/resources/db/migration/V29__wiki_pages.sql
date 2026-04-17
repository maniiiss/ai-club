-- 项目级 Wiki 首版：页面、版本、访问控制、Hindsight 同步任务与 Hermes 会话绑定。

CREATE TABLE wiki_page (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    parent_page_id BIGINT,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    visibility_scope VARCHAR(30) NOT NULL DEFAULT 'PROJECT_MEMBERS',
    sort_order INTEGER NOT NULL DEFAULT 0,
    current_version_number INTEGER NOT NULL DEFAULT 1,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    last_synced_at TIMESTAMP,
    last_sync_error VARCHAR(1000) NOT NULL DEFAULT '',
    author_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_parent FOREIGN KEY (parent_page_id) REFERENCES wiki_page(id) ON DELETE RESTRICT,
    CONSTRAINT fk_wiki_page_author FOREIGN KEY (author_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_wiki_page_project_slug UNIQUE (project_id, slug)
);

CREATE INDEX idx_wiki_page_project_sort ON wiki_page(project_id, sort_order ASC, id ASC);
CREATE INDEX idx_wiki_page_parent_sort ON wiki_page(parent_page_id, sort_order ASC, id ASC);
CREATE INDEX idx_wiki_page_project_updated ON wiki_page(project_id, updated_at DESC, id DESC);

CREATE TABLE wiki_page_version (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL,
    version_number INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    author_user_id BIGINT,
    change_summary VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_version_page FOREIGN KEY (page_id) REFERENCES wiki_page(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_version_author FOREIGN KEY (author_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_wiki_page_version_number UNIQUE (page_id, version_number)
);

CREATE INDEX idx_wiki_page_version_page_number ON wiki_page_version(page_id, version_number DESC);

CREATE TABLE wiki_page_access (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    permission VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_access_page FOREIGN KEY (page_id) REFERENCES wiki_page(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_access_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_wiki_page_access_user_permission UNIQUE (page_id, user_id, permission)
);

CREATE INDEX idx_wiki_page_access_page ON wiki_page_access(page_id);
CREATE INDEX idx_wiki_page_access_user ON wiki_page_access(user_id);

CREATE TABLE wiki_page_sync_task (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT,
    project_id BIGINT NOT NULL,
    operation VARCHAR(20) NOT NULL,
    document_id VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_sync_task_page FOREIGN KEY (page_id) REFERENCES wiki_page(id) ON DELETE SET NULL,
    CONSTRAINT fk_wiki_page_sync_task_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE
);

CREATE INDEX idx_wiki_page_sync_task_poll
    ON wiki_page_sync_task(status, next_attempt_at ASC, id ASC);

ALTER TABLE hermes_conversation_session
    ADD COLUMN wiki_page_id BIGINT;

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Wiki 查看', 'wiki:view', 'ACTION', NULL, NULL, '', NULL, 26, TRUE, TRUE, '查看项目 Wiki 页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'wiki:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'Wiki 维护', 'wiki:manage', 'ACTION', NULL, NULL, '', NULL, 27, TRUE, TRUE, '维护项目 Wiki 页面'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'wiki:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_permission_rel.role_id, target_permission.id
FROM role_permission_rel
JOIN permission_info AS source_permission ON source_permission.code = 'project:view'
JOIN permission_info AS target_permission ON target_permission.code = 'wiki:view'
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
JOIN permission_info AS target_permission ON target_permission.code = 'wiki:manage'
WHERE role_permission_rel.permission_id = source_permission.id
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel AS existing_rel
      WHERE existing_rel.role_id = role_permission_rel.role_id
        AND existing_rel.permission_id = target_permission.id
  );
