-- 为 task_info 表增加创建时间字段
ALTER TABLE task_info ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 将已有记录的 created_at 回填为 updated_at，避免全部显示为迁移时间
UPDATE task_info SET created_at = updated_at;
