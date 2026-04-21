-- 智能体管理已移除“分类”字段，数据库不再保留该历史列。

ALTER TABLE agent_info
    DROP COLUMN IF EXISTS category;
