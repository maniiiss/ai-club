-- 工作项移除分类字段，并为状态体系补充“草稿”。

ALTER TABLE task_info
    DROP COLUMN IF EXISTS category;
