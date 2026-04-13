-- 仓库规范扫描：补充 GitLab Clone 地址与执行步骤进度字段。

ALTER TABLE project_gitlab_binding
ADD COLUMN IF NOT EXISTS gitlab_http_clone_url VARCHAR(500);

ALTER TABLE project_gitlab_binding
ADD COLUMN IF NOT EXISTS gitlab_ssh_clone_url VARCHAR(500);

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE execution_step
ADD COLUMN IF NOT EXISTS latest_message VARCHAR(1000) NOT NULL DEFAULT '';
