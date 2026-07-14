-- 编排绑定保存 Runtime Registry、Profile、工具与沙箱策略快照。

ALTER TABLE execution_orchestration_step_binding ADD COLUMN IF NOT EXISTS runtime_registry_code_snapshot VARCHAR(40);
ALTER TABLE execution_orchestration_step_binding ADD COLUMN IF NOT EXISTS profile_version_snapshot BIGINT;
ALTER TABLE execution_orchestration_step_binding ADD COLUMN IF NOT EXISTS capabilities_snapshot_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE execution_orchestration_step_binding ADD COLUMN IF NOT EXISTS tool_policy_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE execution_orchestration_step_binding ADD COLUMN IF NOT EXISTS sandbox_policy_snapshot_json TEXT NOT NULL DEFAULT '{}';
