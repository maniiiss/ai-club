-- 数据工作台 v1 到项目绑定版：
-- 1. 每个 data_workbench_entity 一对一绑定一个 project_info；
-- 2. 移除动态 project_id_column 逻辑，SQL 执行不再向业务表注入项目隔离 WHERE；
-- 3. entity_code 唯一性从全局改为 (platform_project_id, entity_code) 联合唯一；
-- 4. 未绑定项目的历史实体及其工单/审计一并硬清理，避免残留破坏语义。

ALTER TABLE data_workbench_entity ADD COLUMN platform_project_id BIGINT;

-- 硬迁移：清理无法归属平台项目的历史数据（本次目标环境仅示例数据）。
DELETE FROM data_change_audit
 WHERE request_id IN (
    SELECT id FROM data_change_request
     WHERE entity_id IN (SELECT id FROM data_workbench_entity WHERE platform_project_id IS NULL)
 );
DELETE FROM data_change_request
 WHERE entity_id IN (SELECT id FROM data_workbench_entity WHERE platform_project_id IS NULL);
DELETE FROM data_workbench_entity WHERE platform_project_id IS NULL;

ALTER TABLE data_workbench_entity ALTER COLUMN platform_project_id SET NOT NULL;
ALTER TABLE data_workbench_entity ADD CONSTRAINT fk_data_workbench_entity_project
    FOREIGN KEY (platform_project_id) REFERENCES project_info(id) ON DELETE CASCADE;
ALTER TABLE data_workbench_entity ADD CONSTRAINT uk_data_workbench_entity_project_code
    UNIQUE (platform_project_id, entity_code);
CREATE INDEX idx_data_workbench_entity_project ON data_workbench_entity(platform_project_id);

-- 释放全局 entity_code 唯一约束，改由联合唯一负责。
ALTER TABLE data_workbench_entity DROP CONSTRAINT IF EXISTS data_workbench_entity_entity_code_key;

-- 丢弃动态项目列。
ALTER TABLE data_workbench_entity DROP COLUMN project_id_column;
