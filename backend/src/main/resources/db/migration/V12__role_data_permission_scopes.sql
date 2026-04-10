-- 角色级可配置数据权限范围。

ALTER TABLE role_info
    ADD COLUMN project_visibility_scope VARCHAR(30) NOT NULL DEFAULT 'PROJECT_PARTICIPANT';

ALTER TABLE role_info
    ADD COLUMN project_manage_scope VARCHAR(30) NOT NULL DEFAULT 'OWNER_OR_CREATOR';

ALTER TABLE role_info
    ADD COLUMN iteration_delete_scope VARCHAR(30) NOT NULL DEFAULT 'CREATOR_ONLY';

ALTER TABLE role_info
    ADD COLUMN task_delete_scope VARCHAR(30) NOT NULL DEFAULT 'CREATOR_ONLY';

UPDATE role_info
SET project_visibility_scope = COALESCE(project_visibility_scope, 'PROJECT_PARTICIPANT'),
    project_manage_scope = COALESCE(project_manage_scope, 'OWNER_OR_CREATOR'),
    iteration_delete_scope = COALESCE(iteration_delete_scope, 'CREATOR_ONLY'),
    task_delete_scope = COALESCE(task_delete_scope, 'CREATOR_ONLY');
