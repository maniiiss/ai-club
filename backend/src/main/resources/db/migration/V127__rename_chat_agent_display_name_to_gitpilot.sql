-- 将未被用户自定义过的聊天室默认助手名称迁移为 GitPilot；保留用户主动设置的自定义名称。
UPDATE chat_room_agent_config
SET display_name = 'GitPilot'
WHERE display_name = 'Hermes';

-- 权限管理页面中的历史展示名称也随产品名迁移；权限编码保持 hermes:chat 兼容不变。
UPDATE permission_info
SET name = 'GitPilot 助手',
    description = '使用顶部 GitPilot 助手能力'
WHERE code = 'hermes:chat'
  AND name = 'Hermes 助手';
