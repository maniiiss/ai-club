-- 允许 execution_step_event 记录 run 级事件。
-- 最终摘要、错误摘要、仓库扫描打包产物等事件不一定天然归属于某个步骤，因此 step_id 允许为空。

ALTER TABLE execution_step_event
ALTER COLUMN step_id DROP NOT NULL;
