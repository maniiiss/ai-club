-- MarkItDown 文档转 Markdown 支持：通用文档资产、Wiki 来源文件和 Hermes 会话附件。

CREATE TABLE document_asset (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(120) NOT NULL DEFAULT '',
    file_size BIGINT NOT NULL DEFAULT 0,
    object_key VARCHAR(500) NOT NULL,
    source_format VARCHAR(20) NOT NULL,
    binding_status VARCHAR(20) NOT NULL DEFAULT 'TEMP',
    bound_biz_type VARCHAR(50) NOT NULL DEFAULT '',
    bound_biz_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_document_asset_owner FOREIGN KEY (owner_user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE INDEX idx_document_asset_owner_status
    ON document_asset(owner_user_id, binding_status, created_at DESC, id DESC);

CREATE INDEX idx_document_asset_binding
    ON document_asset(bound_biz_type, bound_biz_id, id);

CREATE INDEX idx_document_asset_temp_cleanup
    ON document_asset(binding_status, created_at ASC, id ASC);

ALTER TABLE wiki_page_v2
    ADD COLUMN source_document_asset_id BIGINT;

ALTER TABLE wiki_page_v2
    ADD CONSTRAINT fk_wiki_page_v2_source_document_asset
    FOREIGN KEY (source_document_asset_id) REFERENCES document_asset(id) ON DELETE SET NULL;

CREATE INDEX idx_wiki_page_v2_source_document_asset
    ON wiki_page_v2(source_document_asset_id);

CREATE TABLE hermes_conversation_attachment (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    document_asset_id BIGINT NOT NULL,
    suggested_title VARCHAR(200) NOT NULL DEFAULT '',
    markdown TEXT NOT NULL DEFAULT '',
    truncated BOOLEAN NOT NULL DEFAULT FALSE,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hermes_conversation_attachment_message FOREIGN KEY (message_id) REFERENCES hermes_conversation_message(id) ON DELETE CASCADE,
    CONSTRAINT fk_hermes_conversation_attachment_asset FOREIGN KEY (document_asset_id) REFERENCES document_asset(id) ON DELETE RESTRICT
);

CREATE INDEX idx_hermes_conversation_attachment_message
    ON hermes_conversation_attachment(message_id, created_at ASC, id ASC);

CREATE INDEX idx_hermes_conversation_attachment_asset
    ON hermes_conversation_attachment(document_asset_id);
