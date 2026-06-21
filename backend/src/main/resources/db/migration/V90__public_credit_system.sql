-- 公众端积分系统：用户积分账户、功能扣费配置与账务流水。
CREATE TABLE credit_global_config (
    id BIGINT PRIMARY KEY,
    register_grant_amount INTEGER NOT NULL DEFAULT 0,
    register_grant_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_global_config_id CHECK (id = 1),
    CONSTRAINT chk_credit_global_config_register_grant_amount CHECK (register_grant_amount >= 0)
);

INSERT INTO credit_global_config (id, register_grant_amount, register_grant_enabled)
VALUES (1, 0, TRUE);

CREATE TABLE credit_feature_config (
    id BIGSERIAL PRIMARY KEY,
    feature_code VARCHAR(80) NOT NULL UNIQUE,
    feature_name VARCHAR(120) NOT NULL,
    cost_amount INTEGER NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_feature_config_cost_amount CHECK (cost_amount > 0)
);

CREATE TABLE user_credit_account (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    total_granted INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    total_refunded INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_credit_account_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT chk_user_credit_account_balance CHECK (balance >= 0),
    CONSTRAINT chk_user_credit_account_total_granted CHECK (total_granted >= 0),
    CONSTRAINT chk_user_credit_account_total_consumed CHECK (total_consumed >= 0),
    CONSTRAINT chk_user_credit_account_total_refunded CHECK (total_refunded >= 0)
);

CREATE TABLE user_credit_transaction (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    feature_code VARCHAR(80),
    business_key VARCHAR(160),
    reason VARCHAR(500) NOT NULL DEFAULT '',
    operator_user_id BIGINT,
    related_transaction_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_credit_transaction_account FOREIGN KEY (account_id) REFERENCES user_credit_account(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_credit_transaction_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_credit_transaction_operator FOREIGN KEY (operator_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_user_credit_transaction_related FOREIGN KEY (related_transaction_id) REFERENCES user_credit_transaction(id) ON DELETE SET NULL,
    CONSTRAINT chk_user_credit_transaction_type CHECK (transaction_type IN ('REGISTER_GRANT', 'ADJUST_INCREASE', 'ADJUST_DECREASE', 'CONSUME', 'REFUND')),
    CONSTRAINT chk_user_credit_transaction_amount CHECK (amount <> 0),
    CONSTRAINT chk_user_credit_transaction_balance_after CHECK (balance_after >= 0)
);

CREATE INDEX idx_user_credit_transaction_user_created_at ON user_credit_transaction(user_id, created_at DESC);
CREATE INDEX idx_user_credit_transaction_account_created_at ON user_credit_transaction(account_id, created_at DESC);
CREATE INDEX idx_user_credit_transaction_feature_business ON user_credit_transaction(feature_code, business_key);
CREATE UNIQUE INDEX uk_user_credit_transaction_consume_business
    ON user_credit_transaction(user_id, feature_code, business_key)
    WHERE transaction_type = 'CONSUME' AND feature_code IS NOT NULL AND business_key IS NOT NULL;

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '积分管理', 'system:credit:view', 'MENU', '/credits', 'CreditManagementView', 'Coin', NULL, 130, TRUE, TRUE, '查看公众端积分配置、账户余额与流水'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:credit:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '积分维护', 'system:credit:manage', 'ACTION', NULL, NULL, '', NULL, 131, TRUE, TRUE, '维护积分赠送配置、功能扣费规则并调整用户积分'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'system:credit:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN ('system:credit:view', 'system:credit:manage')
WHERE role_info.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
