-- GitLab 仓库代码结构快照：为代码仓库管理页沉淀分支级 GitNexus 概览结果。

CREATE TABLE IF NOT EXISTS gitlab_code_structure_snapshot (
    id BIGSERIAL PRIMARY KEY,
    binding_id BIGINT NOT NULL,
    branch_name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL,
    commit_sha VARCHAR(120),
    generated_at TIMESTAMP,
    degraded BOOLEAN NOT NULL DEFAULT FALSE,
    summary_markdown TEXT,
    overview_json TEXT,
    graph_json TEXT,
    last_error_message TEXT,
    refresh_started_at TIMESTAMP,
    refresh_finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_gitlab_code_structure_snapshot_binding
        FOREIGN KEY (binding_id) REFERENCES project_gitlab_binding(id) ON DELETE CASCADE,
    CONSTRAINT uk_gitlab_code_structure_snapshot_binding_branch UNIQUE (binding_id, branch_name)
);

CREATE INDEX IF NOT EXISTS idx_gitlab_code_structure_snapshot_binding_id
    ON gitlab_code_structure_snapshot(binding_id);

CREATE INDEX IF NOT EXISTS idx_gitlab_code_structure_snapshot_binding_generated_at
    ON gitlab_code_structure_snapshot(binding_id, generated_at DESC, id DESC);
