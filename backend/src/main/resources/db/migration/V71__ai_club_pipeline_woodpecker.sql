-- AI Club Pipeline 直集成 Woodpecker：保存平台流水线定义，Jenkins 旧绑定继续留在 project_pipeline_binding。

CREATE TABLE IF NOT EXISTS ai_club_pipeline (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    gitlab_binding_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    provider_code VARCHAR(30) NOT NULL DEFAULT 'WOODPECKER',
    default_branch VARCHAR(100),
    config_path VARCHAR(255) NOT NULL DEFAULT '.woodpecker.yml',
    woodpecker_repo_id BIGINT,
    woodpecker_repo_full_name VARCHAR(255),
    woodpecker_repo_url VARCHAR(500),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_status VARCHAR(30),
    last_run_message VARCHAR(500),
    last_run_number INTEGER,
    last_run_url VARCHAR(500),
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_club_pipeline_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_club_pipeline_gitlab_binding FOREIGN KEY (gitlab_binding_id) REFERENCES project_gitlab_binding(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_ai_club_pipeline_project_name
    ON ai_club_pipeline(project_id, name);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_project_id
    ON ai_club_pipeline(project_id);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_gitlab_binding_id
    ON ai_club_pipeline(gitlab_binding_id);

CREATE INDEX IF NOT EXISTS idx_ai_club_pipeline_repo_id
    ON ai_club_pipeline(woodpecker_repo_id);

UPDATE permission_info
SET name = '流水线中心',
    path = '/cicd/pipeline-bindings',
    component = 'PipelineBindingView',
    icon = 'DataAnalysis',
    description = '查看 AI Club Pipeline 与外部 Jenkins 兼容能力'
WHERE code = 'cicd:view';

UPDATE permission_info
SET name = '流水线维护',
    description = '维护 AI Club Pipeline 与外部 Jenkins 兼容配置'
WHERE code = 'cicd:manage';

UPDATE permission_info
SET name = '流水线构建',
    description = '触发 AI Club Pipeline 与外部 Jenkins 构建'
WHERE code = 'cicd:build';
