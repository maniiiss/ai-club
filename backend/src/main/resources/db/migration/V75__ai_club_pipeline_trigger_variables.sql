-- AI Club Pipeline 固定触发变量：支持同仓库同 YAML 通过不同变量复用多条流水线条目。

ALTER TABLE ai_club_pipeline
    ADD COLUMN IF NOT EXISTS trigger_variables_json TEXT;
