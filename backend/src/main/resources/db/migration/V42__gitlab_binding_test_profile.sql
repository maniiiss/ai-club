-- 为 GitLab 仓库绑定补充项目级测试模板配置，供开发执行 TEST 边车复用。
ALTER TABLE project_gitlab_binding
    ADD COLUMN test_profile_json TEXT;
