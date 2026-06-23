-- LightRAG 索引队列（PG outbox）。
-- 业务意图：Wiki 页面保存/删除时同事务入队，消费者在 code-processing 异步调用 LightRAG 抽取，
-- 避免同步 LLM 调用拖死编辑接口，同时保证「页面存了、入队前宕机」不会丢消息。
CREATE TABLE lightrag_ingest_queue (
    id           BIGSERIAL PRIMARY KEY,
    namespace    VARCHAR(128) NOT NULL,
    page_id      BIGINT NOT NULL,
    page_version INT,
    op           VARCHAR(16) NOT NULL,
    status       VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    retry_count  INT NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ
);
CREATE INDEX idx_lightrag_queue_status_locked ON lightrag_ingest_queue (status, locked_until);
CREATE INDEX idx_lightrag_queue_namespace_page ON lightrag_ingest_queue (namespace, page_id);

-- LightRAG 索引状态表，定时兜底扫描的判定依据。
-- 记录每个页面最后成功索引的版本，扫描器据此找出落后版本补入队。
CREATE TABLE wiki_lightrag_index_state (
    page_id         BIGINT PRIMARY KEY,
    namespace       VARCHAR(128) NOT NULL,
    indexed_version INT,
    indexed_at      TIMESTAMPTZ,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    last_error      TEXT
);
CREATE INDEX idx_wiki_lightrag_state_status ON wiki_lightrag_index_state (status);
