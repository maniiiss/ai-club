-- CanvasKit 原生 Design 版本协议。
-- 旧 preview_html 仅属于已废弃的 HTML 工作区协议；原生场景不迁移旧内容，避免把 HTML 当成视觉事实源。
ALTER TABLE gitpilot_design_version
    ADD COLUMN IF NOT EXISTS scene_json TEXT,
    ADD COLUMN IF NOT EXISTS preview_image TEXT;

ALTER TABLE gitpilot_design_version
    DROP COLUMN IF EXISTS preview_html;

ALTER TABLE gitpilot_design_version
    DROP COLUMN IF EXISTS snapshot_json;
