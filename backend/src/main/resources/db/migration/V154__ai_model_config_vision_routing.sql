-- 平台模型 visionRouting 开关：声明此模型的上游支持 vision（如经过 9router 代理），
-- 让 CLI 在 inputModalities 不含 image 时仍把图片内联到请求，由后端透传给上游 vision 模型。
-- 详见 docs/design-docs/gitpilot-image-vision-fallback-technical-design-v1.md L1。
ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS vision_routing BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ai_model_config.vision_routing IS '声明上游支持 vision，CLI 据此在 text-only 模型下仍内联图片，由后端透传给上游';
