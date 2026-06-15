ALTER TABLE ai_model_config
    ADD COLUMN openai_api_mode VARCHAR(40) NOT NULL DEFAULT 'AUTO';

UPDATE ai_model_config
SET openai_api_mode = 'AUTO'
WHERE openai_api_mode IS NULL
   OR TRIM(openai_api_mode) = '';

ALTER TABLE ai_model_config
    ADD CONSTRAINT chk_ai_model_config_openai_api_mode
        CHECK (openai_api_mode IN ('AUTO', 'RESPONSES', 'CHAT_COMPLETIONS', 'CHAT_COMPLETIONS_PLAIN'));
