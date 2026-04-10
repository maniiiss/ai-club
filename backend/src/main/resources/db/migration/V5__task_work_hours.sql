-- 任务工时字段，单位为小时，最大 15 小时。

ALTER TABLE task_info
    ADD COLUMN IF NOT EXISTS work_hours NUMERIC(4, 1);
