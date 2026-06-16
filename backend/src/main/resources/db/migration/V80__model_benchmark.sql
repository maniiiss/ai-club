-- 模型对比测试（Benchmark）功能：保存压测整体配置与逐模型指标，支持历史回看与对比
CREATE TABLE ai_model_benchmark_run (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    concurrency INT NOT NULL,
    total_requests INT NOT NULL,
    stream_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_tokens INT NOT NULL DEFAULT 512,
    system_prompt TEXT NOT NULL DEFAULT '',
    user_prompt TEXT NOT NULL DEFAULT '',
    model_ids TEXT NOT NULL,                       -- JSON 数组，存放参与对比的 ai_model_config.id
    progress_total INT NOT NULL DEFAULT 0,         -- = total_requests * model_count
    progress_done INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT chk_ai_model_benchmark_run_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED'))
);

CREATE INDEX idx_ai_model_benchmark_run_status ON ai_model_benchmark_run(status);
CREATE INDEX idx_ai_model_benchmark_run_created_at ON ai_model_benchmark_run(created_at DESC);

-- 单次压测中，每个模型一行汇总指标
CREATE TABLE ai_model_benchmark_metric (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL,
    model_id BIGINT NOT NULL,
    model_name VARCHAR(160) NOT NULL,
    provider VARCHAR(40) NOT NULL DEFAULT '',
    model_real_name VARCHAR(160) NOT NULL DEFAULT '',
    total_count INT NOT NULL DEFAULT 0,
    success_count INT NOT NULL DEFAULT 0,
    failure_count INT NOT NULL DEFAULT 0,
    failure_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_output_tokens DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_ttft_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    p50_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    p95_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_token_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
    gen_token_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
    throughput DOUBLE PRECISION NOT NULL DEFAULT 0,
    wall_time_ms BIGINT NOT NULL DEFAULT 0,
    token_estimated BOOLEAN NOT NULL DEFAULT FALSE,
    sample_error TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ai_model_benchmark_metric_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED')),
    CONSTRAINT fk_ai_model_benchmark_metric_run FOREIGN KEY (run_id) REFERENCES ai_model_benchmark_run(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_model_benchmark_metric_run_id ON ai_model_benchmark_metric(run_id);
CREATE INDEX idx_ai_model_benchmark_metric_model_id ON ai_model_benchmark_metric(model_id);

-- 模型对比测试权限种子
INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description) VALUES
    ('模型对比测试', 'model:benchmark', 'ACTION', NULL, NULL, '', NULL, 62, TRUE, TRUE, '发起模型对比测试与压测');

-- 同步授予超级管理员
INSERT INTO role_permission_rel (role_id, permission_id)
SELECT 1, id FROM permission_info WHERE code = 'model:benchmark'
ON CONFLICT DO NOTHING;
