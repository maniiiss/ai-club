-- 固定语义查询解释时使用的语义、Schema 和数据源版本，避免预览与执行跨版本漂移。

ALTER TABLE data_workbench_data_source
    ADD COLUMN IF NOT EXISTS config_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE data_workbench_semantic_model
    ADD COLUMN IF NOT EXISTS data_source_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE data_workbench_query_request
    ADD COLUMN IF NOT EXISTS data_source_id BIGINT;
ALTER TABLE data_workbench_query_request
    ADD COLUMN IF NOT EXISTS semantic_version_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_workbench_query_request
    ADD COLUMN IF NOT EXISTS data_source_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE data_workbench_query_request
    ADD COLUMN IF NOT EXISTS definition_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE data_workbench_query_request
    ADD COLUMN IF NOT EXISTS schema_snapshot_json TEXT NOT NULL DEFAULT '{}';

UPDATE data_workbench_semantic_model m
SET data_source_version = s.config_version
FROM data_workbench_data_source s
WHERE m.data_source_id = s.id
  AND m.data_source_version = 0;

UPDATE data_workbench_query_request q
SET data_source_id = m.data_source_id,
    semantic_version_no = m.version_no,
    data_source_version = s.config_version,
    definition_snapshot_json = m.published_definition_json,
    schema_snapshot_json = m.published_schema_snapshot_json
FROM data_workbench_semantic_model m
JOIN data_workbench_data_source s ON s.id = m.data_source_id
WHERE q.semantic_model_id = m.id
  AND q.data_source_id IS NULL;

ALTER TABLE data_workbench_query_request
    ALTER COLUMN data_source_id SET NOT NULL;

ALTER TABLE data_workbench_query_request
    ADD CONSTRAINT fk_dw_query_data_source
    FOREIGN KEY (data_source_id) REFERENCES data_workbench_data_source(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_dw_query_request_source
    ON data_workbench_query_request(data_source_id, created_at DESC);
