-- 自动合并日志的"逐条审查问题反馈"表
--
-- 设计目标：
-- 1. 项目分享页（凭 token 匿名访问）可以让访问者对每条 AI 审查问题点 "分析正确 / 分析错误 + 理由"
-- 2. 同一指纹（浏览器+IP 哈希）对同一 (log_id, issue_id) 只保留最新一次反馈（允许覆盖），由唯一索引保障
-- 3. issue_id 为 ReviewIssueItem.id，规则 = "i-" + SHA-256(issueSemanticKey).substring(0,16)；
--    同一句问题在不同 log 里拿到同一个 id，方便后续 LLM 复盘智能体按 issue_id 在项目内做聚合分析
-- 4. 冗余存 issue_text_snapshot：日志文本被截断或 issue_id 算法迭代时仍能复原反馈针对的原句
CREATE TABLE IF NOT EXISTS gitlab_auto_merge_log_issue_feedback (
    id BIGSERIAL PRIMARY KEY,
    log_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    config_id BIGINT,
    issue_id VARCHAR(64) NOT NULL,
    issue_text_snapshot TEXT NOT NULL,
    section VARCHAR(32) NOT NULL,
    verdict VARCHAR(16) NOT NULL,
    reason TEXT,
    submitter_fingerprint_hash VARCHAR(128) NOT NULL,
    submitter_ip_hash VARCHAR(128),
    user_agent VARCHAR(512),
    review_result_snapshot VARCHAR(32),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_amlif_log FOREIGN KEY (log_id) REFERENCES gitlab_auto_merge_log(id) ON DELETE CASCADE,
    CONSTRAINT fk_amlif_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_amlif_log_issue_fp UNIQUE (log_id, issue_id, submitter_fingerprint_hash),
    CONSTRAINT ck_amlif_verdict CHECK (verdict IN ('CORRECT', 'INCORRECT')),
    CONSTRAINT ck_amlif_section CHECK (section IN ('NEWLY_RAISED', 'PENDING'))
);

-- 列表分页 / 按项目复盘按 created_at 倒序
CREATE INDEX IF NOT EXISTS idx_amlif_project_created
    ON gitlab_auto_merge_log_issue_feedback (project_id, created_at DESC);

-- "同一条 issue 在该项目下被反馈了多少次/正反比" 这类聚合
CREATE INDEX IF NOT EXISTS idx_amlif_issue_verdict
    ON gitlab_auto_merge_log_issue_feedback (issue_id, verdict);

-- 详情对话框打开时按当前 fingerprint 批量回填某条 log 的所有 issue 反馈
CREATE INDEX IF NOT EXISTS idx_amlif_log_fp
    ON gitlab_auto_merge_log_issue_feedback (log_id, submitter_fingerprint_hash);
