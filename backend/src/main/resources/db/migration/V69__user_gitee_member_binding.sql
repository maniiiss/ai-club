-- 用户管理补充 Gitee 企业成员绑定快照，供本地账号和远端成员建立人工映射。

ALTER TABLE user_info
    ADD COLUMN IF NOT EXISTS gitee_member_id BIGINT,
    ADD COLUMN IF NOT EXISTS gitee_username VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS gitee_name VARCHAR(100) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_user_info_gitee_member_id
    ON user_info(gitee_member_id);
