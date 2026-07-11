-- 双端技术设计 AI Runtime：公众端积分配置、默认权限与异步积分结算。

INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled)
SELECT 'TECHNICAL_DESIGN_AI', '技术设计 AI Runtime', 5, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM credit_feature_config WHERE feature_code = 'TECHNICAL_DESIGN_AI'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN ('task:view', 'task:execution:create')
WHERE role_info.code = 'PUBLIC_DEFAULT'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel existing_rel
      WHERE existing_rel.role_id = role_info.id
        AND existing_rel.permission_id = permission_info.id
  );

CREATE TABLE execution_credit_settlement (
    id BIGSERIAL PRIMARY KEY,
    execution_task_id BIGINT NOT NULL UNIQUE,
    consume_transaction_id BIGINT NOT NULL,
    feature_code VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CHARGED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_credit_settlement_task
        FOREIGN KEY (execution_task_id) REFERENCES execution_task(id) ON DELETE CASCADE,
    CONSTRAINT fk_execution_credit_settlement_transaction
        FOREIGN KEY (consume_transaction_id) REFERENCES user_credit_transaction(id)
);

CREATE INDEX idx_execution_credit_settlement_status
    ON execution_credit_settlement(status);
