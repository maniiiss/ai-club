-- Hermes 个人文件库：每个用户维护自己的长期参考文件，作为个人知识库参与 Hermes 召回。

CREATE TABLE hermes_file_library_item (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    document_asset_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    description VARCHAR(500) NOT NULL DEFAULT '',
    markdown TEXT NOT NULL DEFAULT '',
    source_format VARCHAR(20) NOT NULL DEFAULT '',
    file_size BIGINT NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    index_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hermes_file_library_owner FOREIGN KEY (owner_user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_hermes_file_library_asset FOREIGN KEY (document_asset_id) REFERENCES document_asset(id) ON DELETE RESTRICT
);

CREATE INDEX idx_hermes_file_library_owner_updated
    ON hermes_file_library_item(owner_user_id, updated_at DESC, id DESC);

CREATE INDEX idx_hermes_file_library_owner_enabled_updated
    ON hermes_file_library_item(owner_user_id, enabled, updated_at DESC, id DESC);

CREATE INDEX idx_hermes_file_library_asset
    ON hermes_file_library_item(document_asset_id);
