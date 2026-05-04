-- 为执行工作区清理补充删除结果时间，支撑到期删除状态沉淀与详情展示。

ALTER TABLE execution_workspace_cleanup
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE execution_workspace_cleanup
    ADD COLUMN IF NOT EXISTS delete_failed_at TIMESTAMP;
