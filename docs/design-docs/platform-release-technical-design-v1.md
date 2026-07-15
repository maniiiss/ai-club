# 平台版本发布技术设计 v1

## 1. 目标

平台管理员可以发布不可编辑的版本说明。公众端用户进入受保护产品布局时，读取最新版本；同一用户展示一次后不再重复提示，新版本发布后重新获得一次展示机会。

## 2. 数据模型

- `platform_release`：保存版本号、标题、Markdown 内容、发布人和发布时间，版本号唯一。
- `platform_release_view`：保存用户与版本的展示关系，`(release_id, user_id)` 唯一，关闭弹窗和点击确认都写入该表。

版本发布不复用 `notification_message`，避免发布说明与任务、流水线等即时通知混合。

## 3. 接口与链路

- 管理端 `POST /api/platform-releases` 发布版本，`GET /api/platform-releases/admin` 查看历史。
- 公众端 `GET /api/platform-releases/pending` 读取当前用户尚未展示的最新版本。
- 公众端 `POST /api/platform-releases/{id}/acknowledge` 幂等写入展示状态。

`frontend-public` 的 `ProductLayout` 在已有通知初始化旁边发起待展示查询；请求失败不阻断主页面。弹窗关闭或确认后立即关闭界面并异步提交展示状态，提交失败时下一次进入仍可再次提示。

## 4. 权限

新增 `system:release:view` 和 `system:release:manage`。Flyway 迁移会把两项权限授予超级管理员以及已有 `system:user:manage` 权限的角色，兼容现有管理员授权习惯。

## 5. 内容安全

后端限制 Markdown 内容长度并统一换行；公众端复用已有 `Markdown` 组件渲染，不直接拼接未经处理的 HTML。管理端使用现有 `MarkdownEditor` 和 `MdPreview` 完成编辑与预览。
