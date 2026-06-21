ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS openai_api_mode VARCHAR(40) NOT NULL DEFAULT 'AUTO';

UPDATE ai_model_config
SET openai_api_mode = 'AUTO'
WHERE openai_api_mode IS NULL
   OR TRIM(openai_api_mode) = '';

-- PostgreSQL 不支持 ADD CONSTRAINT IF NOT EXISTS，这里先删后建，
-- 既能兼容已存在旧约束的数据库，也能保持 H2/PostgreSQL 两套校验环境一致。
ALTER TABLE ai_model_config
    DROP CONSTRAINT IF EXISTS chk_ai_model_config_openai_api_mode;

ALTER TABLE ai_model_config
    ADD CONSTRAINT chk_ai_model_config_openai_api_mode
        CHECK (openai_api_mode IN ('AUTO', 'RESPONSES', 'CHAT_COMPLETIONS', 'CHAT_COMPLETIONS_PLAIN'));
