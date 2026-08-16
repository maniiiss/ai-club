-- GitPilot Desktop Design 修订上传后的项目版本仓库。
-- snapshot_json 保存完整可审计快照；激活、恢复只变更状态或创建新草稿，不覆盖历史记录。
CREATE TABLE IF NOT EXISTS gitpilot_design_version (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES project_info(id) ON DELETE CASCADE,
    design_id VARCHAR(120) NOT NULL,
    revision_id VARCHAR(160) NOT NULL,
    version_no INT NOT NULL,
    title VARCHAR(120) NOT NULL,
    summary VARCHAR(1000) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    snapshot_json TEXT NOT NULL,
    preview_html TEXT NOT NULL,
    creator_user_id BIGINT REFERENCES user_info(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_gitpilot_design_version_revision UNIQUE (project_id, design_id, revision_id),
    CONSTRAINT ck_gitpilot_design_version_status CHECK (status IN ('DRAFT', 'CURRENT', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS idx_gitpilot_design_version_project_design
    ON gitpilot_design_version(project_id, design_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_gitpilot_design_version_project_status
    ON gitpilot_design_version(project_id, status);
