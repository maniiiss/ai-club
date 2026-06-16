-- 模型对比测试：把"配置"与"运行记录"拆开
--   ai_model_benchmark_config 承载可重复编辑、可重复触发的配置
--   ai_model_benchmark_run 沿用原表，新增 config_id 外键，原配置字段语义改为"运行时快照"
--   历史 run 智能合并去重为 config，保留全部历史指标可观察性
--
-- 注意：V81 已被 V81__hermes_session_executed_actions.sql 占用，本迁移使用 V82。

-- 1. 配置表
CREATE TABLE ai_model_benchmark_config (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    concurrency INT NOT NULL,
    total_requests INT NOT NULL,
    stream_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_tokens INT NOT NULL DEFAULT 512,
    system_prompt TEXT NOT NULL DEFAULT '',
    user_prompt TEXT NOT NULL DEFAULT '',
    model_ids TEXT NOT NULL DEFAULT '[]',  -- JSON 数组字符串，存放 ai_model_config.id
    created_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_model_benchmark_config_created_at ON ai_model_benchmark_config(created_at DESC);
CREATE INDEX idx_ai_model_benchmark_config_created_by ON ai_model_benchmark_config(created_by);

-- 2. run 增加 config_id（先允许 NULL，回填后再加 NOT NULL）
ALTER TABLE ai_model_benchmark_run ADD COLUMN config_id BIGINT;

-- 3. 历史数据智能合并：按"基准 name + 配置字段"分组合并去重为 config
--   3.1 计算每条 run 的"基准 name"（裁掉末尾任意层 -重跑）
--   3.2 同一组只生成一条 config，使用最早 run 的 created_by / created_at 作为 config 元信息
--   3.3 把组内全部 run 的 config_id 回填到该 config

-- 3.1 / 3.2：用 CTE + INSERT...SELECT，不依赖额外临时表，避免 Flyway 多语句兼容问题
WITH base_runs AS (
    SELECT
        id,
        regexp_replace(name, '(-重跑)+$', '') AS base_name,
        concurrency,
        total_requests,
        stream_enabled,
        max_tokens,
        system_prompt,
        user_prompt,
        model_ids,
        created_by,
        created_at
    FROM ai_model_benchmark_run
),
grouped AS (
    -- 每个分组取最早创建 run 作为代表（id 最小），用它的 created_by / created_at 写到 config
    SELECT DISTINCT ON (
        base_name,
        concurrency,
        total_requests,
        stream_enabled,
        max_tokens,
        md5(coalesce(system_prompt, '')),
        md5(coalesce(user_prompt, '')),
        coalesce(model_ids, '[]')
    )
        base_name,
        concurrency,
        total_requests,
        stream_enabled,
        max_tokens,
        system_prompt,
        user_prompt,
        model_ids,
        created_by,
        created_at
    FROM base_runs
    ORDER BY
        base_name,
        concurrency,
        total_requests,
        stream_enabled,
        max_tokens,
        md5(coalesce(system_prompt, '')),
        md5(coalesce(user_prompt, '')),
        coalesce(model_ids, '[]'),
        created_at,
        id
)
INSERT INTO ai_model_benchmark_config (
    name, concurrency, total_requests, stream_enabled, max_tokens,
    system_prompt, user_prompt, model_ids, created_by, created_at, updated_at
)
SELECT
    base_name,
    concurrency,
    total_requests,
    stream_enabled,
    max_tokens,
    system_prompt,
    user_prompt,
    model_ids,
    created_by,
    created_at,
    created_at
FROM grouped;

-- 3.3 回填 run.config_id：按相同分组键匹配
UPDATE ai_model_benchmark_run r
SET config_id = c.id
FROM ai_model_benchmark_config c
WHERE
    regexp_replace(r.name, '(-重跑)+$', '') = c.name
    AND r.concurrency = c.concurrency
    AND r.total_requests = c.total_requests
    AND r.stream_enabled = c.stream_enabled
    AND r.max_tokens = c.max_tokens
    AND md5(coalesce(r.system_prompt, '')) = md5(coalesce(c.system_prompt, ''))
    AND md5(coalesce(r.user_prompt, '')) = md5(coalesce(c.user_prompt, ''))
    AND coalesce(r.model_ids, '[]') = coalesce(c.model_ids, '[]');

-- 4. 强约束 + 外键 + 索引
ALTER TABLE ai_model_benchmark_run ALTER COLUMN config_id SET NOT NULL;

ALTER TABLE ai_model_benchmark_run
    ADD CONSTRAINT fk_ai_model_benchmark_run_config
    FOREIGN KEY (config_id) REFERENCES ai_model_benchmark_config(id);

CREATE INDEX idx_ai_model_benchmark_run_config_created_at
    ON ai_model_benchmark_run(config_id, created_at DESC);
