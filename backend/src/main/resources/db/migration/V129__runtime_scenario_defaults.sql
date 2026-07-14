-- Runtime 场景默认绑定：由平台管理员统一维护助手、聊天室和执行中心的默认路由。

CREATE TABLE runtime_scenario_default (
    scenario_code VARCHAR(50) PRIMARY KEY,
    runtime_registry_code VARCHAR(40) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_runtime_scenario_default_runtime
        FOREIGN KEY (runtime_registry_code) REFERENCES runtime_registry(runtime_code)
);

INSERT INTO runtime_scenario_default(scenario_code, runtime_registry_code)
VALUES
    ('ASSISTANT', 'HERMES_LEGACY'),
    ('CHAT_ROOM', 'HERMES_LEGACY'),
    ('DEVELOPMENT_IMPLEMENTATION', 'CODEX_CLI'),
    ('TECHNICAL_DESIGN_AUTHORING', 'CODEX_CLI')
ON CONFLICT (scenario_code) DO NOTHING;
