-- 为任务工作项增加细分任务类型，支持需求拆解智能体生成的任务分类落库。
ALTER TABLE task_info ADD COLUMN IF NOT EXISTS task_type VARCHAR(30);

UPDATE task_info
SET task_type = '开发任务'
WHERE work_item_type = '任务' AND task_type IS NULL;
