-- GitLab 自动合并显式触发目标：按行保存选中的 AI Club / Jenkins 流水线。
-- 使用独立子表而不是 JSON，便于后续校验、级联清理和多类型扩展。
CREATE TABLE IF NOT EXISTS gitlab_auto_merge_pipeline_target (
    id                  BIGSERIAL PRIMARY KEY,
    config_id           BIGINT NOT NULL REFERENCES gitlab_auto_merge_config(id) ON DELETE CASCADE,
    target_type         VARCHAR(20) NOT NULL,
    ai_club_pipeline_id BIGINT REFERENCES ai_club_pipeline(id) ON DELETE CASCADE,
    jenkins_binding_id  BIGINT REFERENCES project_pipeline_binding(id) ON DELETE CASCADE,
    created_at          TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP NOT NULL,
    CONSTRAINT chk_gitlab_auto_merge_pipeline_target_type
        CHECK (target_type IN ('AI_CLUB', 'JENKINS')),
    CONSTRAINT chk_gitlab_auto_merge_pipeline_target_ref
        CHECK (
            (ai_club_pipeline_id IS NOT NULL AND jenkins_binding_id IS NULL)
            OR
            (ai_club_pipeline_id IS NULL AND jenkins_binding_id IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_gitlab_auto_merge_pipeline_target_config_id
    ON gitlab_auto_merge_pipeline_target(config_id);

CREATE UNIQUE INDEX IF NOT EXISTS uk_gitlab_auto_merge_target_ai_club
    ON gitlab_auto_merge_pipeline_target(config_id, ai_club_pipeline_id)
    WHERE ai_club_pipeline_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_gitlab_auto_merge_target_jenkins
    ON gitlab_auto_merge_pipeline_target(config_id, jenkins_binding_id)
    WHERE jenkins_binding_id IS NOT NULL;
