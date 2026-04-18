ALTER TABLE ai_model_config
    ADD COLUMN model_type VARCHAR(30) NOT NULL DEFAULT 'CHAT';

UPDATE ai_model_config
SET model_type = 'CHAT'
WHERE model_type IS NULL
   OR TRIM(model_type) = '';

ALTER TABLE ai_model_config
    ADD CONSTRAINT chk_ai_model_config_model_type
        CHECK (model_type IN ('CHAT', 'EMBEDDING'));
