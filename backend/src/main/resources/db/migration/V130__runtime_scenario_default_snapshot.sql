-- 执行任务固化场景默认 Runtime，避免管理员切换默认值影响已创建但尚未执行的任务。

ALTER TABLE execution_task
    ADD COLUMN IF NOT EXISTS runtime_registry_code_snapshot VARCHAR(40);
