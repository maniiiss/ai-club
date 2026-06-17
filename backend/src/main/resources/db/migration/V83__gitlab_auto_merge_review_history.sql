-- 为 GitLab 自动合并日志补充项目快照与结构化审查问题，支持同一 MR 的历史问题带入与修复判断。

ALTER TABLE gitlab_auto_merge_log
ADD COLUMN IF NOT EXISTS gitlab_project_ref_snapshot VARCHAR(255);

ALTER TABLE gitlab_auto_merge_log
ADD COLUMN IF NOT EXISTS review_issues_json TEXT;

ALTER TABLE gitlab_auto_merge_log
ADD COLUMN IF NOT EXISTS resolved_previous_issues_json TEXT;

ALTER TABLE gitlab_auto_merge_log
ADD COLUMN IF NOT EXISTS unresolved_previous_issues_json TEXT;

CREATE INDEX IF NOT EXISTS idx_gitlab_auto_merge_log_project_ref_mr_result_executed_at
    ON gitlab_auto_merge_log(gitlab_project_ref_snapshot, merge_request_iid, result, executed_at DESC, id DESC);
