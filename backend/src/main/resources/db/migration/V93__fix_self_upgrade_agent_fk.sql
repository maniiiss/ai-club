-- 修复 self_upgrade_center_config 表的智能体外键约束，添加 ON DELETE SET NULL，
-- 使删除智能体时自动清空引用，而不是阻止删除。

ALTER TABLE self_upgrade_center_config DROP CONSTRAINT IF EXISTS fk_self_upgrade_center_config_dev_plan_agent;
ALTER TABLE self_upgrade_center_config ADD CONSTRAINT fk_self_upgrade_center_config_dev_plan_agent
    FOREIGN KEY (development_plan_agent_id) REFERENCES agent_info(id) ON DELETE SET NULL;

ALTER TABLE self_upgrade_center_config DROP CONSTRAINT IF EXISTS fk_self_upgrade_center_config_dev_impl_agent;
ALTER TABLE self_upgrade_center_config ADD CONSTRAINT fk_self_upgrade_center_config_dev_impl_agent
    FOREIGN KEY (development_implement_agent_id) REFERENCES agent_info(id) ON DELETE SET NULL;

ALTER TABLE self_upgrade_center_config DROP CONSTRAINT IF EXISTS fk_self_upgrade_center_config_dev_test_agent;
ALTER TABLE self_upgrade_center_config ADD CONSTRAINT fk_self_upgrade_center_config_dev_test_agent
    FOREIGN KEY (development_test_agent_id) REFERENCES agent_info(id) ON DELETE SET NULL;

ALTER TABLE self_upgrade_center_config DROP CONSTRAINT IF EXISTS fk_self_upgrade_center_config_dev_report_agent;
ALTER TABLE self_upgrade_center_config ADD CONSTRAINT fk_self_upgrade_center_config_dev_report_agent
    FOREIGN KEY (development_report_agent_id) REFERENCES agent_info(id) ON DELETE SET NULL;
