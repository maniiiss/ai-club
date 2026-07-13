# GitPilot 扩展主题设计

## 目标

在现有 `deep-sea`、`ocean-mist`、`signal-teal` 之上新增普通纯白和黑色工作台主题。五套主题共用同一套主题 ID、接口和本地缓存，不拆分亮色/暗色开关。

## 主题方案

- `paper-white`｜纯白：白色工作台、浅灰边界，主色为 GitPilot 电光蓝 `#2F6BFF`，适合传统办公风格。
- `carbon-black`｜曜石黑：页面 `#080C12`、卡片 `#111821`、侧栏 `#0D131B`，文字 `#E8EEF5`，主色为高亮蓝 `#5F8AFF`，辅以信号青和橙色。

默认仍为 `deep-sea`。黑色主题只改变工作台表面、文字、边框、Element Plus 变量和认证页背景，不改变业务布局。

## 同步与迁移

后端 `ThemeCatalog` 扩展为五个合法主题 ID；`PUT /api/auth/theme`、`CurrentUserInfo.themeId`、Redis `LoginSession` 和 `user_info.theme_id` 继续复用现有链路。历史用户和旧缓存仍统一使用 `deep-sea`。

## 验收

- 两个前端展示五个主题并共用 `gitpilot-theme`。
- 后端接受新增两个 ID，继续拒绝未知 ID。
- 登录恢复、退出和失败回滚逻辑对新增主题行为不变。
- 前端测试/构建、后端主题测试、编码和差异检查通过。
