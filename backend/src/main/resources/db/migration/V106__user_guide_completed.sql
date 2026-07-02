-- 新增用户引导完成状态字段，记录用户已完成新手引导的页面 key
ALTER TABLE user_info ADD COLUMN guide_completed VARCHAR(500) NOT NULL DEFAULT '';
