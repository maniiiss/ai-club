-- 为用户资料补充头像访问地址字段，支持个人中心上传头像后在多处展示。

ALTER TABLE user_info
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) NOT NULL DEFAULT '';
