-- 用户反馈：用于保存右上角入口提交的反馈与建议。

CREATE TABLE user_feedback (
    id BIGSERIAL PRIMARY KEY,
    feedback_type VARCHAR(20) NOT NULL,
    title VARCHAR(100) NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    submitter_user_id BIGINT NOT NULL,
    submitter_username VARCHAR(50) NOT NULL DEFAULT '',
    submitter_nickname VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_feedback_type CHECK (feedback_type IN ('BUG', 'SUGGESTION', 'EXPERIENCE', 'OTHER'))
);

CREATE INDEX idx_user_feedback_submitter_user_id ON user_feedback(submitter_user_id);
CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at DESC);
