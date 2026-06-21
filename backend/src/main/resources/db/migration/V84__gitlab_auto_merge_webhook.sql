-- GitLab 自动合并外发 Webhook 通知配置：一个自动合并配置可挂多条独立的投递目标。
-- URL 可能携带签名 token，因此整体加密落库；仅记录最近一次投递结果，不做重试。
CREATE TABLE IF NOT EXISTS gitlab_auto_merge_webhook (
    id                       BIGSERIAL PRIMARY KEY,
    config_id                BIGINT NOT NULL REFERENCES gitlab_auto_merge_config(id) ON DELETE CASCADE,
    name                     VARCHAR(120) NOT NULL,
    target_url_ciphertext    TEXT NOT NULL,
    subscribed_events_json   TEXT NOT NULL DEFAULT '["MERGED","AI_REJECTED","FAILED"]',
    message_template         TEXT,
    enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
    last_delivery_at         TIMESTAMP,
    last_delivery_status     VARCHAR(60),
    last_delivery_message    VARCHAR(500),
    created_at               TIMESTAMP NOT NULL,
    updated_at               TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gitlab_auto_merge_webhook_config_id
    ON gitlab_auto_merge_webhook(config_id);
