-- 把历史通过 code-processing 私有桥接端点接入的 Agent 原地回填为统一 CLI Runner 配置，
-- 这样旧数据也能直接命中新版 runtimeType 推荐与执行链路，无需用户手工逐条重配。

UPDATE agent_info
SET access_type = 'AGENT_RUNTIME',
    runtime_type = 'CODEX_CLI',
    runtime_agent_ref = NULL,
    endpoint_url = regexp_replace(trim(endpoint_url), '/api/code/codex-executions(/start)?/?$', '', 'i'),
    http_method = 'POST',
    http_request_template = NULL,
    http_response_path = NULL
WHERE upper(COALESCE(access_type, '')) IN ('HTTP_API', 'AGENT_RUNTIME')
  AND COALESCE(endpoint_url, '') ~* '/api/code/codex-executions(/start)?/?$';

UPDATE agent_info
SET access_type = 'AGENT_RUNTIME',
    runtime_type = 'CLAUDE_CODE_CLI',
    runtime_agent_ref = NULL,
    endpoint_url = regexp_replace(trim(endpoint_url), '/api/code/claude-plans(/start)?/?$', '', 'i'),
    http_method = 'POST',
    http_request_template = NULL,
    http_response_path = NULL
WHERE upper(COALESCE(access_type, '')) IN ('HTTP_API', 'AGENT_RUNTIME')
  AND COALESCE(endpoint_url, '') ~* '/api/code/claude-plans(/start)?/?$';
