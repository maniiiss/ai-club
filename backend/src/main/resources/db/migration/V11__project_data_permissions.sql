-- 项目级数据权限字段补充与历史数据回填。

ALTER TABLE project_info
    ADD COLUMN creator_user_id BIGINT;

ALTER TABLE iteration_info
    ADD COLUMN creator_user_id BIGINT;

ALTER TABLE task_info
    ADD COLUMN creator_user_id BIGINT;

ALTER TABLE gitlab_auto_merge_log
    ADD COLUMN project_id BIGINT;

ALTER TABLE project_info
    ADD CONSTRAINT fk_project_creator_user
        FOREIGN KEY (creator_user_id) REFERENCES user_info(id) ON DELETE SET NULL;

ALTER TABLE iteration_info
    ADD CONSTRAINT fk_iteration_creator_user
        FOREIGN KEY (creator_user_id) REFERENCES user_info(id) ON DELETE SET NULL;

ALTER TABLE task_info
    ADD CONSTRAINT fk_task_creator_user
        FOREIGN KEY (creator_user_id) REFERENCES user_info(id) ON DELETE SET NULL;

ALTER TABLE gitlab_auto_merge_log
    ADD CONSTRAINT fk_auto_merge_log_project
        FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE SET NULL;

CREATE INDEX idx_project_creator_user_id ON project_info(creator_user_id);
CREATE INDEX idx_iteration_creator_user_id ON iteration_info(creator_user_id);
CREATE INDEX idx_task_creator_user_id ON task_info(creator_user_id);
CREATE INDEX idx_auto_merge_log_project_id ON gitlab_auto_merge_log(project_id);

UPDATE project_info
SET creator_user_id = owner_user_id
WHERE creator_user_id IS NULL;

UPDATE iteration_info iteration
SET creator_user_id = project.owner_user_id
FROM project_info project
WHERE iteration.project_id = project.id
  AND iteration.creator_user_id IS NULL;

UPDATE task_info task
SET creator_user_id = project.owner_user_id
FROM project_info project
WHERE task.project_id = project.id
  AND task.creator_user_id IS NULL;

UPDATE gitlab_auto_merge_log log
SET project_id = binding.project_id
FROM gitlab_auto_merge_config config
         JOIN project_gitlab_binding binding ON config.binding_id = binding.id
WHERE log.config_id = config.id
  AND log.project_id IS NULL;

DELETE FROM gitlab_auto_merge_config
WHERE execution_mode = 'PROJECT_BOUND'
  AND binding_id IS NULL;
