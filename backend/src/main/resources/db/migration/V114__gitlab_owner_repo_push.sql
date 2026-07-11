-- GitLab 代码推送到业主代码仓库：业主仓库绑定 + 推送历史日志。
--
-- 背景：平台需要把自身 GitLab 仓库的代码交付到业主方（其他 GitLab 实例）的代码仓库。
-- 凭据按项目独立配置（业主仓库地址 + 访问 Token，AES-GCM 加密存储）。
-- 推送内容为整个分支镜像（保留完整提交历史），由 code-processing 通过原生 git push 完成，
-- backend 负责编排、凭据解密、权限校验和落库。
-- 推送方式支持三种：DIRECT（直接推送覆盖目标分支）/ NEW_BRANCH（推到交付子分支）/ MERGE_REQUEST（推到子分支并发起 MR）。

-- 业主仓库绑定（项目级 CRUD，一个项目可配置多个业主仓库）
CREATE TABLE IF NOT EXISTS project_owner_repo_binding (
    id                       BIGSERIAL PRIMARY KEY,
    project_id               BIGINT NOT NULL,
    name                     VARCHAR(100) NOT NULL,
    api_base_url             VARCHAR(255) NOT NULL,
    gitlab_project_ref       VARCHAR(255) NOT NULL,
    gitlab_project_id        VARCHAR(100),
    gitlab_project_name      VARCHAR(200),
    gitlab_project_path      VARCHAR(255),
    gitlab_project_web_url   VARCHAR(255),
    gitlab_http_clone_url    VARCHAR(500),
    gitlab_ssh_clone_url     VARCHAR(500),
    default_target_branch    VARCHAR(100),
    default_push_mode        VARCHAR(20) NOT NULL DEFAULT 'NEW_BRANCH',
    token_ciphertext         TEXT NOT NULL,
    enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
    last_push_status         VARCHAR(30),
    last_push_message        VARCHAR(500),
    last_pushed_at           TIMESTAMP,
    created_at               TIMESTAMP NOT NULL,
    updated_at               TIMESTAMP NOT NULL,
    CONSTRAINT fk_owner_repo_binding_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT ck_owner_repo_push_mode CHECK (default_push_mode IN ('DIRECT', 'NEW_BRANCH', 'MERGE_REQUEST'))
);

CREATE INDEX IF NOT EXISTS idx_owner_repo_binding_project
    ON project_owner_repo_binding(project_id);

-- 业主仓库推送历史日志
CREATE TABLE IF NOT EXISTS owner_repo_push_log (
    id                        BIGSERIAL PRIMARY KEY,
    binding_id                BIGINT NOT NULL,
    source_binding_id         BIGINT,
    source_branch             VARCHAR(100) NOT NULL,
    target_branch             VARCHAR(100) NOT NULL,
    push_mode                 VARCHAR(20) NOT NULL,
    source_commit_sha         VARCHAR(64),
    target_commit_sha         VARCHAR(64),
    merge_request_iid         VARCHAR(64),
    merge_request_web_url     VARCHAR(500),
    execution_status          VARCHAR(20) NOT NULL,
    summary_message           VARCHAR(1000),
    executed_at               TIMESTAMP NOT NULL,
    created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_owner_repo_push_log_binding FOREIGN KEY (binding_id) REFERENCES project_owner_repo_binding(id) ON DELETE CASCADE,
    CONSTRAINT fk_owner_repo_push_log_source FOREIGN KEY (source_binding_id) REFERENCES project_gitlab_binding(id) ON DELETE SET NULL,
    CONSTRAINT ck_owner_repo_log_mode CHECK (push_mode IN ('DIRECT', 'NEW_BRANCH', 'MERGE_REQUEST')),
    CONSTRAINT ck_owner_repo_log_status CHECK (execution_status IN ('SUCCESS', 'PARTIAL', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_owner_repo_push_log_binding
    ON owner_repo_push_log(binding_id, created_at DESC, id DESC);

-- 新增业主仓库维护权限（ACTION 类型），查看复用现有 gitlab:view
INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '业主仓库维护', 'gitlab:owner-repo:manage', 'ACTION', NULL, NULL, '', NULL, 72, TRUE, TRUE, '管理业主代码仓库绑定并触发代码推送'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'gitlab:owner-repo:manage');

-- 超级管理员自动获得全部权限（V1 已有 SELECT 1,id FROM permission_info），无需额外处理。
-- 给 PUBLIC_DEFAULT（公众端自助注册用户默认角色）补授查看与推送权限，使公众端可发起业主仓库推送。
INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN (
    'gitlab:owner-repo:manage'
)
WHERE role_info.code = 'PUBLIC_DEFAULT'
  AND NOT EXISTS (
      SELECT 1 FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id
        AND existing_rel.permission_id = permission_info.id
  );
