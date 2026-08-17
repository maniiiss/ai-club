-- 平台模型的输入能力由管理员显式配置，供桌面端和 CLI 决定是否发送图片输入。
ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS input_modalities VARCHAR(32) NOT NULL DEFAULT 'text';

UPDATE ai_model_config
SET input_modalities = 'text'
WHERE input_modalities IS NULL
   OR TRIM(input_modalities) = '';

ALTER TABLE ai_model_config
    DROP CONSTRAINT IF EXISTS chk_ai_model_config_input_modalities;

ALTER TABLE ai_model_config
    ADD CONSTRAINT chk_ai_model_config_input_modalities
        CHECK (input_modalities IN ('text', 'text,image'));

COMMENT ON COLUMN ai_model_config.input_modalities IS '模型输入模态，text 或 text,image；由平台配置并下发给 CLI/桌面端';
