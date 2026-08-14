-- 仓库镜像绑定新增自定义克隆地址字段，非空时推送优先使用，绕过 GitLab API 返回地址不可达的情况
ALTER TABLE project_owner_repo_binding
    ADD COLUMN IF NOT EXISTS custom_clone_url VARCHAR(500);

COMMENT ON COLUMN project_owner_repo_binding.custom_clone_url IS '仓库镜像自定义克隆地址，非空时推送优先使用，留空回退到自动探测的 gitlab_http_clone_url';
