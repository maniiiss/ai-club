-- 空间化 Wiki：空间、成员、目录、页面、版本与同步任务。

CREATE TABLE wiki_space (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    read_scope VARCHAR(20) NOT NULL DEFAULT 'MEMBERS_ONLY',
    creator_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_space_creator FOREIGN KEY (creator_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_wiki_space_created_at ON wiki_space(created_at DESC, id DESC);

CREATE TABLE wiki_space_member (
    id BIGSERIAL PRIMARY KEY,
    space_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    member_role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_space_member_space FOREIGN KEY (space_id) REFERENCES wiki_space(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_space_member_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_wiki_space_member_user UNIQUE (space_id, user_id)
);

CREATE INDEX idx_wiki_space_member_space ON wiki_space_member(space_id);
CREATE INDEX idx_wiki_space_member_user ON wiki_space_member(user_id);

CREATE TABLE wiki_directory (
    id BIGSERIAL PRIMARY KEY,
    space_id BIGINT NOT NULL,
    parent_directory_id BIGINT,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(160) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    bound_project_id BIGINT,
    created_by_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_directory_space FOREIGN KEY (space_id) REFERENCES wiki_space(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_directory_parent FOREIGN KEY (parent_directory_id) REFERENCES wiki_directory(id) ON DELETE RESTRICT,
    CONSTRAINT fk_wiki_directory_project FOREIGN KEY (bound_project_id) REFERENCES project_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_wiki_directory_creator FOREIGN KEY (created_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_wiki_directory_space_sort ON wiki_directory(space_id, sort_order ASC, id ASC);
CREATE INDEX idx_wiki_directory_parent_sort ON wiki_directory(parent_directory_id, sort_order ASC, id ASC);
CREATE INDEX idx_wiki_directory_bound_project ON wiki_directory(bound_project_id, space_id, id);
CREATE UNIQUE INDEX uk_wiki_directory_space_parent_slug
    ON wiki_directory(space_id, COALESCE(parent_directory_id, 0), slug);

CREATE TABLE wiki_page_v2 (
    id BIGSERIAL PRIMARY KEY,
    space_id BIGINT NOT NULL,
    directory_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    current_version_number INTEGER NOT NULL DEFAULT 1,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    last_synced_at TIMESTAMP,
    last_sync_error VARCHAR(1000) NOT NULL DEFAULT '',
    author_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_v2_space FOREIGN KEY (space_id) REFERENCES wiki_space(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_v2_directory FOREIGN KEY (directory_id) REFERENCES wiki_directory(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_v2_author FOREIGN KEY (author_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_wiki_page_v2_space_slug UNIQUE (space_id, slug)
);

CREATE INDEX idx_wiki_page_v2_directory ON wiki_page_v2(directory_id, updated_at DESC, id DESC);
CREATE INDEX idx_wiki_page_v2_space_updated ON wiki_page_v2(space_id, updated_at DESC, id DESC);

CREATE TABLE wiki_page_version_v2 (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL,
    version_number INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    change_summary VARCHAR(500) NOT NULL DEFAULT '',
    author_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_version_v2_page FOREIGN KEY (page_id) REFERENCES wiki_page_v2(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_version_v2_author FOREIGN KEY (author_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT uk_wiki_page_version_v2_number UNIQUE (page_id, version_number)
);

CREATE INDEX idx_wiki_page_version_v2_page_number ON wiki_page_version_v2(page_id, version_number DESC);

CREATE TABLE wiki_page_sync_task_v2 (
    id BIGSERIAL PRIMARY KEY,
    space_id BIGINT NOT NULL,
    page_id BIGINT,
    operation VARCHAR(20) NOT NULL,
    document_id VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wiki_page_sync_task_v2_space FOREIGN KEY (space_id) REFERENCES wiki_space(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_page_sync_task_v2_page FOREIGN KEY (page_id) REFERENCES wiki_page_v2(id) ON DELETE SET NULL
);

CREATE INDEX idx_wiki_page_sync_task_v2_poll
    ON wiki_page_sync_task_v2(status, next_attempt_at ASC, id ASC);

ALTER TABLE hermes_conversation_session
    ADD COLUMN wiki_space_id BIGINT;
