-- CLI Runtime 已统一走平台级 code-processing 地址与内部服务鉴权，
-- 历史 Agent 上遗留的 gateway、session key、HTTP 鉴权与模板字段不再需要，统一清理。

UPDATE agent_info
SET endpoint_url = NULL,
    runtime_agent_ref = NULL,
    runtime_session_key_template = NULL,
    http_headers = NULL,
    http_auth_type = NULL,
    http_auth_token_ciphertext = NULL,
    http_request_template = NULL,
    http_response_path = NULL
WHERE upper(COALESCE(access_type, '')) = 'AGENT_RUNTIME'
  AND upper(COALESCE(runtime_type, '')) IN ('CODEX_CLI', 'CLAUDE_CODE_CLI');
