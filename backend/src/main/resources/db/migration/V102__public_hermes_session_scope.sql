-- Hermes 会话作用域支持：项目浮标按项目过滤，并保留后端全局作用域索引兼容空绑定会话查询。

CREATE INDEX IF NOT EXISTS idx_hermes_conversation_session_project_scope
    ON hermes_conversation_session(user_id, archived, project_id, last_message_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_hermes_conversation_session_global_scope
    ON hermes_conversation_session(user_id, archived, last_message_at DESC, id DESC)
    WHERE project_id IS NULL
      AND task_id IS NULL
      AND iteration_id IS NULL
      AND plan_id IS NULL
      AND wiki_space_id IS NULL
      AND wiki_page_id IS NULL;

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code = 'hermes:chat'
WHERE role_info.code = 'PUBLIC_DEFAULT'
ON CONFLICT DO NOTHING;
