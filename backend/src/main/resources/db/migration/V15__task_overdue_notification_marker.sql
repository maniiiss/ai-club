ALTER TABLE task_info
ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_task_plan_end_date ON task_info(plan_end_date);
CREATE INDEX IF NOT EXISTS idx_task_overdue_notified_at ON task_info(overdue_notified_at);
