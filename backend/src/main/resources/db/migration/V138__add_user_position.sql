ALTER TABLE user_info
    ADD COLUMN IF NOT EXISTS user_position VARCHAR(30);

COMMENT ON COLUMN user_info.user_position IS '用户主定位，仅用于公众端工作台信息优先级；空值表示存量账号尚未设置';
