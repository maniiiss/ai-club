CREATE TABLE chat_room (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    project_id BIGINT,
    creator_user_id BIGINT NOT NULL,
    visibility_type VARCHAR(30) NOT NULL DEFAULT 'GLOBAL_INVITE',
    latest_preview VARCHAR(500) NOT NULL DEFAULT '',
    history_summary TEXT NOT NULL DEFAULT '',
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP,
    CONSTRAINT fk_chat_room_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_room_creator FOREIGN KEY (creator_user_id) REFERENCES user_info(id)
);

CREATE INDEX idx_chat_room_project ON chat_room(project_id);
CREATE INDEX idx_chat_room_last_message ON chat_room(archived, last_message_at DESC, updated_at DESC, id DESC);

CREATE TABLE chat_room_member (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_room_member_room FOREIGN KEY (room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_room_member_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT uk_chat_room_member UNIQUE (room_id, user_id)
);

CREATE INDEX idx_chat_room_member_user ON chat_room_member(user_id);

CREATE TABLE chat_message (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL,
    sender_user_id BIGINT,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    sender_username_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    sender_name_snapshot VARCHAR(100) NOT NULL DEFAULT '',
    sender_avatar_snapshot VARCHAR(255) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'DONE',
    mentions_hermes BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_message_room FOREIGN KEY (room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_message_sender FOREIGN KEY (sender_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE INDEX idx_chat_message_room_time ON chat_message(room_id, created_at ASC, id ASC);

CREATE TABLE chat_message_attachment (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    document_asset_id BIGINT NOT NULL,
    suggested_title VARCHAR(200) NOT NULL DEFAULT '',
    markdown TEXT NOT NULL DEFAULT '',
    truncated BOOLEAN NOT NULL DEFAULT FALSE,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_attachment_message FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_attachment_asset FOREIGN KEY (document_asset_id) REFERENCES document_asset(id)
);

CREATE INDEX idx_chat_attachment_message ON chat_message_attachment(message_id);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '聊天室查看', 'chat:view', 'ACTION', NULL, NULL, '', 1, 122, TRUE, TRUE, '查看并进入公众端多人聊天室'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'chat:view'
);

INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '聊天室管理', 'chat:manage', 'ACTION', NULL, NULL, '', 1, 123, TRUE, TRUE, '创建聊天室并维护全局房间成员'
WHERE NOT EXISTS (
    SELECT 1 FROM permission_info WHERE code = 'chat:manage'
);

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info
JOIN permission_info ON permission_info.code IN ('chat:view', 'chat:manage')
WHERE role_info.code IN ('PUBLIC_DEFAULT', 'SUPER_ADMIN')
  AND NOT EXISTS (
      SELECT 1
      FROM role_permission_rel
      WHERE role_permission_rel.role_id = role_info.id
        AND role_permission_rel.permission_id = permission_info.id
  );
