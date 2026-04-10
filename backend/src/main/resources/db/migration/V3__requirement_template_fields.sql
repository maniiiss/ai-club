-- 需求模板化改造：增加统一 Markdown 文档和独立原型链接字段。

ALTER TABLE task_info
    ADD COLUMN IF NOT EXISTS requirement_markdown TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS prototype_url VARCHAR(500) NOT NULL DEFAULT '';
