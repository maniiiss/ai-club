-- 产品名迁移：聊天室正式更名为 Hearths · 围炉。
-- 权限编码 chat:view / chat:manage 保持兼容不变，仅更新管理端权限页的展示名称与描述。
UPDATE permission_info
SET name = 'Hearths 查看',
    description = '查看并进入公众端多人围炉'
WHERE code = 'chat:view'
  AND name = '聊天室查看';

UPDATE permission_info
SET name = 'Hearths 管理',
    description = '创建围炉并维护全局房间成员'
WHERE code = 'chat:manage'
  AND name = '聊天室管理';
