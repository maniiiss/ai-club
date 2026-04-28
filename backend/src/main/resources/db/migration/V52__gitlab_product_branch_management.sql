-- GitLab 产品分支管理：为仓库绑定补充产品主线，并新增产品分线与同步日志表。

ALTER TABLE project_gitlab_binding
ADD COLUMN IF NOT EXISTS product_main_branch VARCHAR(100);

CREATE TABLE IF NOT EXISTS gitlab_product_branch (
    id BIGSERIAL PRIMARY KEY,
    binding_id BIGINT NOT NULL,
    line_code VARCHAR(80) NOT NULL,
    line_name VARCHAR(120) NOT NULL,
    branch_name VARCHAR(120) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_status VARCHAR(30),
    last_sync_message VARCHAR(500),
    last_sync_at TIMESTAMP,
    last_sync_merge_request_iid BIGINT,
    last_sync_merge_request_web_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_gitlab_product_branch_binding
        FOREIGN KEY (binding_id) REFERENCES project_gitlab_binding(id) ON DELETE CASCADE,
    CONSTRAINT uk_gitlab_product_branch_binding_line_code UNIQUE (binding_id, line_code),
    CONSTRAINT uk_gitlab_product_branch_binding_branch_name UNIQUE (binding_id, branch_name)
);

CREATE INDEX IF NOT EXISTS idx_gitlab_product_branch_binding_id
    ON gitlab_product_branch(binding_id);

CREATE TABLE IF NOT EXISTS gitlab_product_branch_sync_log (
    id BIGSERIAL PRIMARY KEY,
    binding_id BIGINT NOT NULL,
    product_branch_id BIGINT,
    product_branch_line_code VARCHAR(80),
    product_branch_line_name VARCHAR(120),
    source_branch_name VARCHAR(120) NOT NULL,
    target_branch_name VARCHAR(120) NOT NULL,
    source_commit_sha VARCHAR(80),
    target_commit_sha VARCHAR(80),
    merge_request_iid BIGINT,
    merge_request_title VARCHAR(255),
    merge_request_web_url VARCHAR(500),
    result VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    executed_by_user_id BIGINT,
    executed_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_gitlab_product_branch_sync_log_binding
        FOREIGN KEY (binding_id) REFERENCES project_gitlab_binding(id) ON DELETE CASCADE,
    CONSTRAINT fk_gitlab_product_branch_sync_log_branch
        FOREIGN KEY (product_branch_id) REFERENCES gitlab_product_branch(id) ON DELETE SET NULL,
    CONSTRAINT fk_gitlab_product_branch_sync_log_user
        FOREIGN KEY (executed_by_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gitlab_product_branch_sync_log_binding_id
    ON gitlab_product_branch_sync_log(binding_id);

CREATE INDEX IF NOT EXISTS idx_gitlab_product_branch_sync_log_branch_id
    ON gitlab_product_branch_sync_log(product_branch_id);

CREATE INDEX IF NOT EXISTS idx_gitlab_product_branch_sync_log_binding_executed_at
    ON gitlab_product_branch_sync_log(binding_id, executed_at DESC, id DESC);
