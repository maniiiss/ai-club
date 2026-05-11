-- 用户管理补充 GitLab 用户绑定快照，供本地账号和远端用户建立人工映射。

ALTER TABLE user_info
    ADD COLUMN IF NOT EXISTS gitlab_user_id BIGINT;

ALTER TABLE user_info
    ADD COLUMN IF NOT EXISTS gitlab_name VARCHAR(100) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_user_info_gitlab_user_id
    ON user_info(gitlab_user_id);
