-- 将“仓库镜像”相关权限文案调整为“仓库镜像”，保持功能语义与产品界面一致。
UPDATE permission_info
SET name = '仓库镜像维护',
    description = '管理仓库镜像绑定并触发代码推送'
WHERE code = 'gitlab:owner-repo:manage';
