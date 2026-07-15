-- GitPilot 单条助手回答反馈闭环：评价、运营处理和复盘数据集。

CREATE TABLE assistant_message_feedback (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    user_message_id BIGINT,
    assistant_message_id BIGINT NOT NULL,
    submitter_user_id BIGINT NOT NULL,
    submitter_username VARCHAR(100) NOT NULL DEFAULT '',
    submitter_nickname VARCHAR(100) NOT NULL DEFAULT '',
    vote VARCHAR(10) NOT NULL,
    reason_codes_json TEXT NOT NULL DEFAULT '[]',
    comment TEXT NOT NULL DEFAULT '',
    question_snapshot TEXT NOT NULL DEFAULT '',
    answer_snapshot TEXT NOT NULL DEFAULT '',
    runtime_registry_code VARCHAR(40) NOT NULL DEFAULT '',
    route_name VARCHAR(80) NOT NULL DEFAULT '',
    project_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW',
    assignee_user_id BIGINT,
    resolution_code VARCHAR(40),
    resolution_note TEXT NOT NULL DEFAULT '',
    improvement_tags_json TEXT NOT NULL DEFAULT '[]',
    dataset_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_assistant_feedback_user_message UNIQUE (submitter_user_id, assistant_message_id),
    CONSTRAINT fk_assistant_feedback_session FOREIGN KEY (session_id) REFERENCES hermes_conversation_session(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_feedback_user_message FOREIGN KEY (user_message_id) REFERENCES hermes_conversation_message(id) ON DELETE SET NULL,
    CONSTRAINT fk_assistant_feedback_assistant_message FOREIGN KEY (assistant_message_id) REFERENCES hermes_conversation_message(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_feedback_submitter FOREIGN KEY (submitter_user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_feedback_assignee FOREIGN KEY (assignee_user_id) REFERENCES user_info(id) ON DELETE SET NULL,
    CONSTRAINT chk_assistant_feedback_vote CHECK (vote IN ('UP', 'DOWN')),
    CONSTRAINT chk_assistant_feedback_status CHECK (status IN ('NEW', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'DUPLICATE', 'AUTO_CLOSED')),
    CONSTRAINT chk_assistant_feedback_dataset_status CHECK (dataset_status IN ('PENDING', 'INCLUDED', 'EXCLUDED'))
);

CREATE INDEX idx_assistant_feedback_session ON assistant_message_feedback(session_id);
CREATE INDEX idx_assistant_feedback_assistant_message ON assistant_message_feedback(assistant_message_id);
CREATE INDEX idx_assistant_feedback_status ON assistant_message_feedback(status);
CREATE INDEX idx_assistant_feedback_vote ON assistant_message_feedback(vote);
CREATE INDEX idx_assistant_feedback_created_at ON assistant_message_feedback(created_at DESC);

CREATE TABLE assistant_feedback_activity (
    id BIGSERIAL PRIMARY KEY,
    feedback_id BIGINT NOT NULL,
    action_type VARCHAR(40) NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    note TEXT NOT NULL DEFAULT '',
    actor_user_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assistant_feedback_activity_feedback FOREIGN KEY (feedback_id) REFERENCES assistant_message_feedback(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_feedback_activity_actor FOREIGN KEY (actor_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_assistant_feedback_activity_feedback ON assistant_feedback_activity(feedback_id, created_at DESC);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'GitPilot反馈', 'system:assistant-feedback:view', 'MENU', '/assistant-feedback', 'AssistantFeedbackView', 'ChatDotRound', NULL, 123, TRUE, TRUE, '查看 GitPilot 用户反馈运营队列'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:assistant-feedback:view');

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT 'GitPilot反馈处理', 'system:assistant-feedback:manage', 'ACTION', NULL, NULL, '', NULL, 124, TRUE, TRUE, '处理 GitPilot 用户反馈和复盘数据集'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:assistant-feedback:manage');

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info JOIN permission_info ON permission_info.code IN ('system:assistant-feedback:view', 'system:assistant-feedback:manage')
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1 FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );
