-- Yaade 集成：保存项目绑定、用户绑定与嵌入代理会话所需的最小平台元数据。

CREATE TABLE platform_yaade_project_binding (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    yaade_collection_id BIGINT NOT NULL,
    yaade_group_name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL,
    archived_name VARCHAR(255),
    last_synced_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_platform_yaade_project_binding_project
    ON platform_yaade_project_binding(project_id);

CREATE INDEX idx_platform_yaade_project_binding_status
    ON platform_yaade_project_binding(status);

CREATE TABLE platform_yaade_user_binding (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    yaade_user_id BIGINT NOT NULL,
    yaade_username VARCHAR(120) NOT NULL,
    password_ciphertext TEXT NOT NULL,
    last_synced_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_platform_yaade_user_binding_user
    ON platform_yaade_user_binding(user_id);

CREATE UNIQUE INDEX uk_platform_yaade_user_binding_yaade_user
    ON platform_yaade_user_binding(yaade_user_id);
