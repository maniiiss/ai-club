CREATE TABLE IF NOT EXISTS gitlab_auto_merge_project_share (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    token_ciphertext TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gitlab_auto_merge_project_share_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_gitlab_auto_merge_project_share_project UNIQUE (project_id)
);
