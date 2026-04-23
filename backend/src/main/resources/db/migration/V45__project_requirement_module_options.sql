-- 项目级需求模块候选项，支持所属模块下拉复用与候选删除。

CREATE TABLE project_requirement_module_option (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    module_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_requirement_module_option_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_project_requirement_module_option_project_module UNIQUE (project_id, module_name)
);

CREATE INDEX idx_project_requirement_module_option_project
    ON project_requirement_module_option(project_id, module_name);

INSERT INTO project_requirement_module_option (project_id, module_name)
SELECT source.project_id, source.module_name
FROM (
    SELECT DISTINCT project_id, TRIM(module_name) AS module_name
    FROM task_info
    WHERE work_item_type = '需求'
      AND module_name IS NOT NULL
      AND TRIM(module_name) <> ''
      AND TRIM(module_name) <> '未分类'
) source;
