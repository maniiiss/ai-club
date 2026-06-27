-- 原生 API 工作台 - 同步来源绑定表
-- 设计文档：docs/api-studio-native-technical-design-v1.md
-- 用途：承接 GitLab Spring 接口抽取同步等外部数据源到 native endpoint 的对应关系，
--      取代旧 Yaade data.aiclubSync marker 的幂等/区分语义。

CREATE TABLE IF NOT EXISTS api_studio_sync_binding (
    id BIGSERIAL PRIMARY KEY,
    endpoint_id BIGINT NOT NULL,
    source_type VARCHAR(30) NOT NULL,
    source_binding_id BIGINT NOT NULL,
    branch VARCHAR(255) NOT NULL,
    source_signature VARCHAR(512),
    last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assb_endpoint FOREIGN KEY (endpoint_id) REFERENCES api_studio_endpoint(id) ON DELETE CASCADE,
    CONSTRAINT ck_assb_source_type CHECK (source_type IN ('GITLAB_SPRING_API'))
);

CREATE INDEX IF NOT EXISTS idx_assb_source ON api_studio_sync_binding (source_type, source_binding_id, branch);
CREATE INDEX IF NOT EXISTS idx_assb_endpoint ON api_studio_sync_binding (endpoint_id);
