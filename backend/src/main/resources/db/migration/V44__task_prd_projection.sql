-- 为需求工作项补充模块字段，并建立工作项到 PRD 页面映射关系。

ALTER TABLE task_info
    ADD COLUMN module_name VARCHAR(120) NOT NULL DEFAULT '';

CREATE TABLE task_prd_projection (
    task_id BIGINT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    wiki_space_id BIGINT,
    prd_wiki_directory_id BIGINT,
    prd_wiki_page_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    last_error VARCHAR(1000) NOT NULL DEFAULT '',
    last_generated_at TIMESTAMP,
    last_ai_suggested_at TIMESTAMP,
    last_user_confirmed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_prd_projection_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_prd_projection_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_prd_projection_space FOREIGN KEY (wiki_space_id) REFERENCES wiki_space(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_prd_projection_directory FOREIGN KEY (prd_wiki_directory_id) REFERENCES wiki_directory(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_prd_projection_page FOREIGN KEY (prd_wiki_page_id) REFERENCES wiki_page_v2(id) ON DELETE SET NULL
);

CREATE INDEX idx_task_prd_projection_project_status
    ON task_prd_projection(project_id, status, updated_at DESC);

CREATE INDEX idx_task_prd_projection_space
    ON task_prd_projection(wiki_space_id, prd_wiki_page_id);
