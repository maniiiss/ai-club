-- 自升级中心：回填内部载体项目与默认仓库绑定。
-- 业务意图：
-- 1. 巡检和整改桥接执行中心时依赖内部载体项目，未配置会直接阻断执行。
-- 2. 默认仓库绑定用于“接受建议 -> 生成整改工作项”，提前回填能降低首次配置门槛。
-- 3. 仅在中心配置为空值时回填，避免覆盖管理员已经手工维护的配置。

INSERT INTO self_upgrade_center_config (
    id,
    default_environment_profile_id,
    carrier_project_id,
    default_repository_binding_ids_json,
    development_plan_agent_id,
    development_implement_agent_id,
    development_test_agent_id,
    development_report_agent_id
)
SELECT
    1,
    (
        SELECT env.id
        FROM self_upgrade_environment_profile env
        ORDER BY CASE WHEN env.code = 'STAGING' THEN 0 ELSE 1 END, env.id
        LIMIT 1
    ),
    NULL,
    '[]',
    NULL,
    NULL,
    NULL,
    NULL
WHERE NOT EXISTS (
    SELECT 1 FROM self_upgrade_center_config
);

WITH candidate_environment AS (
    SELECT env.id
    FROM self_upgrade_environment_profile env
    ORDER BY CASE WHEN env.code = 'STAGING' THEN 0 ELSE 1 END, env.id
    LIMIT 1
)
UPDATE self_upgrade_center_config config
SET default_environment_profile_id = candidate_environment.id,
    updated_at = CURRENT_TIMESTAMP
FROM candidate_environment
WHERE config.default_environment_profile_id IS NULL;

WITH candidate_carrier_project AS (
    SELECT binding.project_id
    FROM project_gitlab_binding binding
    WHERE binding.enabled = TRUE
      AND binding.project_id IS NOT NULL
    GROUP BY binding.project_id
    ORDER BY binding.project_id
    LIMIT 1
)
UPDATE self_upgrade_center_config config
SET carrier_project_id = candidate_carrier_project.project_id,
    updated_at = CURRENT_TIMESTAMP
FROM candidate_carrier_project
WHERE config.carrier_project_id IS NULL;

WITH resolved_config AS (
    SELECT
        config.id,
        COALESCE(
            config.carrier_project_id,
            (
                SELECT binding.project_id
                FROM project_gitlab_binding binding
                WHERE binding.enabled = TRUE
                  AND binding.project_id IS NOT NULL
                GROUP BY binding.project_id
                ORDER BY binding.project_id
                LIMIT 1
            )
        ) AS resolved_project_id
    FROM self_upgrade_center_config config
),
candidate_binding_json AS (
    SELECT
        resolved_config.id AS config_id,
        COALESCE(
            jsonb_agg(binding.id ORDER BY binding.id) FILTER (WHERE binding.id IS NOT NULL)::text,
            '[]'
        ) AS binding_ids_json
    FROM resolved_config
    LEFT JOIN project_gitlab_binding binding
        ON binding.project_id = resolved_config.resolved_project_id
       AND binding.enabled = TRUE
    GROUP BY resolved_config.id
)
UPDATE self_upgrade_center_config config
SET default_repository_binding_ids_json = candidate_binding_json.binding_ids_json,
    updated_at = CURRENT_TIMESTAMP
FROM candidate_binding_json
WHERE config.id = candidate_binding_json.config_id
  AND candidate_binding_json.binding_ids_json <> '[]'
  AND (
      config.default_repository_binding_ids_json IS NULL
      OR BTRIM(config.default_repository_binding_ids_json) = ''
      OR config.default_repository_binding_ids_json = '[]'
  );

WITH candidate_plan_agent AS (
    SELECT agent.id
    FROM agent_info agent
    WHERE agent.enabled = TRUE
      AND (
          UPPER(COALESCE(agent.builtin_code, '')) = 'REQUIREMENT_BREAKDOWN'
          OR UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI')
          OR agent.name ILIKE '%planner%'
          OR agent.name LIKE '%规划%'
          OR agent.name LIKE '%需求%'
      )
    ORDER BY
        CASE
            WHEN UPPER(COALESCE(agent.builtin_code, '')) = 'REQUIREMENT_BREAKDOWN' THEN 0
            WHEN UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI') THEN 1
            ELSE 2
        END,
        agent.id
    LIMIT 1
)
UPDATE self_upgrade_center_config config
SET development_plan_agent_id = candidate_plan_agent.id,
    updated_at = CURRENT_TIMESTAMP
FROM candidate_plan_agent
WHERE config.development_plan_agent_id IS NULL;

WITH candidate_implement_agent AS (
    SELECT agent.id
    FROM agent_info agent
    WHERE agent.enabled = TRUE
      AND (
          UPPER(COALESCE(agent.access_type, '')) = 'HTTP_API'
          OR UPPER(COALESCE(agent.access_type, '')) = 'AGENT_RUNTIME'
      )
    ORDER BY
        CASE
            WHEN UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI') THEN 0
            WHEN agent.name ILIKE '%coder%'
                OR agent.name ILIKE '%code%'
                OR agent.name LIKE '%开发%'
                OR agent.name LIKE '%实现%' THEN 1
            ELSE 2
        END,
        agent.id
    LIMIT 1
)
UPDATE self_upgrade_center_config config
SET development_implement_agent_id = candidate_implement_agent.id,
    updated_at = CURRENT_TIMESTAMP
FROM candidate_implement_agent
WHERE config.development_implement_agent_id IS NULL;

WITH candidate_test_agent AS (
    SELECT agent.id
    FROM agent_info agent
    WHERE agent.enabled = TRUE
      AND (
          UPPER(COALESCE(agent.access_type, '')) = 'HTTP_API'
          OR UPPER(COALESCE(agent.access_type, '')) = 'AGENT_RUNTIME'
      )
    ORDER BY
        CASE
            WHEN agent.name ILIKE '%test%'
                OR agent.name ILIKE '%qa%'
                OR agent.name LIKE '%测试%'
                OR agent.name ILIKE '%quality%' THEN 0
            WHEN UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI') THEN 1
            WHEN agent.name ILIKE '%coder%'
                OR agent.name ILIKE '%code%'
                OR agent.name LIKE '%开发%'
                OR agent.name LIKE '%实现%' THEN 2
            ELSE 3
        END,
        agent.id
    LIMIT 1
),
candidate_implement_agent AS (
    SELECT agent.id
    FROM agent_info agent
    WHERE agent.enabled = TRUE
      AND (
          UPPER(COALESCE(agent.access_type, '')) = 'HTTP_API'
          OR UPPER(COALESCE(agent.access_type, '')) = 'AGENT_RUNTIME'
      )
    ORDER BY
        CASE
            WHEN UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI') THEN 0
            WHEN agent.name ILIKE '%coder%'
                OR agent.name ILIKE '%code%'
                OR agent.name LIKE '%开发%'
                OR agent.name LIKE '%实现%' THEN 1
            ELSE 2
        END,
        agent.id
    LIMIT 1
)
UPDATE self_upgrade_center_config config
SET development_test_agent_id = COALESCE(candidate_test_agent.id, candidate_implement_agent.id),
    updated_at = CURRENT_TIMESTAMP
FROM (SELECT 1 AS anchor) seed
LEFT JOIN candidate_test_agent ON TRUE
LEFT JOIN candidate_implement_agent ON TRUE
WHERE config.development_test_agent_id IS NULL
  AND COALESCE(candidate_test_agent.id, candidate_implement_agent.id) IS NOT NULL;

WITH candidate_report_agent AS (
    SELECT agent.id
    FROM agent_info agent
    WHERE agent.enabled = TRUE
      AND (
          agent.name ILIKE '%report%'
          OR agent.name LIKE '%报告%'
          OR agent.name LIKE '%交付%'
          OR agent.name LIKE '%总结%'
          OR agent.name ILIKE '%review%'
          OR agent.name LIKE '%评审%'
          OR UPPER(COALESCE(agent.builtin_code, '')) = 'REQUIREMENT_BREAKDOWN'
          OR agent.name ILIKE '%planner%'
          OR agent.name LIKE '%规划%'
      )
    ORDER BY
        CASE
            WHEN agent.name ILIKE '%report%'
                OR agent.name LIKE '%报告%'
                OR agent.name LIKE '%交付%'
                OR agent.name LIKE '%总结%' THEN 0
            WHEN agent.name ILIKE '%review%'
                OR agent.name LIKE '%评审%' THEN 1
            ELSE 2
        END,
        agent.id
    LIMIT 1
),
candidate_plan_agent AS (
    SELECT agent.id
    FROM agent_info agent
    WHERE agent.enabled = TRUE
      AND (
          UPPER(COALESCE(agent.builtin_code, '')) = 'REQUIREMENT_BREAKDOWN'
          OR UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI')
          OR agent.name ILIKE '%planner%'
          OR agent.name LIKE '%规划%'
          OR agent.name LIKE '%需求%'
      )
    ORDER BY
        CASE
            WHEN UPPER(COALESCE(agent.builtin_code, '')) = 'REQUIREMENT_BREAKDOWN' THEN 0
            WHEN UPPER(COALESCE(agent.runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI') THEN 1
            ELSE 2
        END,
        agent.id
    LIMIT 1
)
UPDATE self_upgrade_center_config config
SET development_report_agent_id = COALESCE(candidate_report_agent.id, candidate_plan_agent.id),
    updated_at = CURRENT_TIMESTAMP
FROM (SELECT 1 AS anchor) seed
LEFT JOIN candidate_report_agent ON TRUE
LEFT JOIN candidate_plan_agent ON TRUE
WHERE config.development_report_agent_id IS NULL
  AND COALESCE(candidate_report_agent.id, candidate_plan_agent.id) IS NOT NULL;
