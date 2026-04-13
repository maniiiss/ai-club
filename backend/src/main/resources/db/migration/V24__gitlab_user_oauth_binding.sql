-- 为当前平台用户新增 GitLab OAuth 绑定表，用于以用户本人身份发起 MR。
CREATE TABLE gitlab_user_oauth_binding (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    api_base_url VARCHAR(255) NOT NULL,
    gitlab_user_id BIGINT NOT NULL,
    gitlab_username VARCHAR(100) NOT NULL,
    gitlab_name VARCHAR(100) NOT NULL,
    access_token_ciphertext TEXT NOT NULL,
    refresh_token_ciphertext TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gitlab_user_oauth_binding_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_gitlab_user_oauth_binding_user UNIQUE (user_id)
);

CREATE INDEX idx_gitlab_user_oauth_binding_api_base_url ON gitlab_user_oauth_binding(api_base_url);
