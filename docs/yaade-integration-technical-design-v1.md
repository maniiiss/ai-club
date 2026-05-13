# Yaade 集成技术设计 v1

## 1. 背景

平台原有 `/apis` 菜单由自研 API 管理子系统承载，支持目录、接口定义、环境、OpenAPI 导入导出和调试记录，但维护成本较高，功能演进也容易落入“重复造轮子”。

本次调整把 `/apis` 切换为 `Yaade` 嵌入式工作台：

- Yaade 负责接口资产的唯一主数据存储与日常录入维护
- AI Club 继续负责项目选择、权限校验、用户身份桥接和页面嵌入
- 历史 `project_api_*` 数据不再迁移，也不再作为主链路读取

## 2. 目标与非目标

### 2.1 目标

- 通过 `docker-compose.yaade.yml` 独立部署 Yaade，不并入主平台 compose 栈。
- 保持 `/apis` 一级菜单不变，但页面主体替换为 Yaade iframe。
- 平台用户进入 `/apis` 时自动同步 Yaade 本地账号和项目分组，并无感进入 Yaade。
- 每个 AI Club 项目映射为 Yaade 一个顶级 collection；保留一个“未关联项目”公共 collection。
- 项目创建、改名、删除时尽量同步 Yaade collection；Yaade 不可用时不阻塞平台其它模块。

### 2.2 非目标

- 不把 Yaade 再次回写成平台内部接口资产表。
- 不引入统一 OIDC/SSO 身份提供方；本次仍采用平台代登模式。
- 不迁移既有 `project_api_*` 历史数据。

## 3. 设计方案

### 3.1 部署与配置

- 新增独立编排文件：`docker-compose.yaade.yml`
- 新增自定义构建目录：`docker/yaade/`
- Yaade 关键环境变量：
  - `YAADE_ADMIN_USERNAME`
  - `YAADE_DEFAULT_PASSWORD`
  - `YAADE_BASE_PATH=/api/yaade/proxy`
  - `YAADE_REF`：上游 Yaade 源码版本，默认 `main`
- 自定义镜像在 client 构建前会依次执行两个补丁脚本，再按 Yaade 官方链路继续执行 `client build -> server build`
  - `docker/yaade/scripts/apply-zh-cn.mjs`：只负责把高频界面文案翻译成中文
  - `docker/yaade/scripts/apply-aiclub-branding.mjs`：只负责注入 AI Club 品牌标题、登录页标识、嵌入态顶栏隐藏、嵌入态单点登录 loading、平台主题桥接和平台主题色映射
- 主平台 backend 新增连接配置：
  - `platform.yaade.base-url`
  - `platform.yaade.admin-username`
  - `platform.yaade.admin-password`
  - `platform.yaade.default-user-password`
  - `platform.yaade.public-collection-name`
  - `platform.yaade.proxy-session-ttl-minutes`

### 3.2 平台元数据

平台只保存 Yaade 集成元数据，不保存接口正文：

- `platform_yaade_project_binding`
  - 记录项目 ID、Yaade collection ID、group 名称、同步状态、归档名称和最近同步时间
- `platform_yaade_user_binding`
  - 记录平台用户 ID、Yaade 用户 ID、Yaade 用户名、平台代持密码密文和最近同步时间

### 3.3 用户与项目同步

- 平台项目映射到 Yaade 顶级 collection，group 名称固定为 `aiclub-project-{projectId}`
- 公共空间固定使用 `aiclub-api-public` group，并绑定到 `未关联项目` collection；公共 collection 继续保留在数据层，但嵌入态 UI 不再提供入口
- 平台用户映射到 Yaade 本地账号 `aiclub-{userId}`
- 每次进入 `/apis` 或切换项目时：
  1. 平台读取当前用户可见项目
  2. 为缺失项目自动补建 collection 绑定
  3. 把用户加入当前可见项目 group 与公共 group
  4. 以该用户身份登录 Yaade，并把 Yaade 远端 session 保存到平台代理会话

### 3.4 iframe 代理

- 前端不直接访问 Yaade 原始地址，只访问平台后端 `/api/yaade/proxy/**`
- 后端在 `POST /api/yaade/embed-sessions` 中写入平台自己的 HttpOnly cookie
- iframe 后续请求只依赖该 cookie，由后端代发 Yaade 远端 session cookie
- `/apis` 页面创建 iframe URL 时会附加嵌入态标记和当前平台主题 ID，并在 iframe 加载或平台主题变化时通过 `AI_CLUB_THEME_CHANGED` 消息通知 Yaade
- 平台还会通过 `AI_CLUB_PROJECT_CONTEXT` 消息把“当前项目 + 可见项目列表 + 项目到 Yaade group/root collection 的映射”传给 Yaade；Yaade 内部项目下拉切换后会反向发送 `AI_CLUB_PROJECT_CHANGED`，平台只同步更新路由 `projectId`，不重建 iframe
- 平台 `/apis` 页面保留 `AppLayout` 的真实顶栏，Hermes 助手、消息中心、用户头像菜单等能力继续由平台壳承载；Yaade 品牌补丁只在 `aiclubEmbedded=1` 时隐藏 Yaade 原生顶栏并释放工作区高度
- Yaade 嵌入态采用“项目优先”视角：先选项目，再显示该项目下的集合与接口；左侧搜索只检索当前项目
- 嵌入态新建/编辑集合时，原始 `groups` 输入收口为“所属项目”单选下拉，底层仍写入对应 `aiclub-project-{projectId}` group
- Yaade 嵌入态登录页会先显示单点登录 loading，并等待 `/api/user` 会话确认；只有平台代理会话失效或代登失败时，才展示 Yaade 原生账密登录页
- Yaade 品牌补丁在运行时读取 `aiclubTheme` 参数、`git-ai-club:theme` 本地缓存或主题消息，把 `sunset-orange`、`ocean-blue`、`forest-green` 映射为 Yaade 浅色工作台背景和强调色变量
- 平台登出时同步清理本地 Yaade 代理 cookie
- 嵌入模式下拦截 Yaade 原生 `/api/logout` 与本地密码修改接口，避免用户把 iframe 工作台踢回 Yaade 自己登录页或改坏平台托管密码

## 4. 生命周期规则

- 项目创建：尽力创建 Yaade collection 与项目绑定；失败时仅记录日志，不阻塞项目创建
- 项目改名：尽力同步 collection 名称
- 项目删除：把 collection 重命名为 `已归档-{projectId}-{原项目名}` 并收缩到 `admin` group，再把平台绑定状态改成 `ARCHIVED`
- 修复同步：`POST /api/yaade/projects/{projectId}/repair-sync` 幂等重建项目绑定

## 5. 验证方式

- `docker compose -f docker-compose.yaade.yml config`
- `python scripts/check_encoding.py`
- `cd backend && mvn -q -Dtest=YaadeClientServiceTests,YaadeEmbedSessionServiceTests,YaadeProjectSyncServiceTests test`
- `cd frontend && npm run build`

## 6. 风险与约束

- Yaade 的 group 是纯字符串，不存在独立 group 实体，因此平台绑定表保存的是 `group name` 而不是 `group id`
- 平台代登依赖 Yaade 本地密码托管；若用户绕过代理直接修改 Yaade 本地密码，平台需要通过“重置到默认密码 + 旋转随机密码”恢复
- Yaade 独立不可用时，`/apis` 会报错，但项目管理、测试管理等其它菜单不应受影响
- 当前中文化采用“高频界面文案补丁”方案，不是 Yaade 官方内建 i18n；升级 `YAADE_REF` 后若上游组件文案变化，构建期补丁会主动失败并提示重新对齐
- AI Club 品牌适配独立于中文化补丁维护，避免品牌主题和翻译文案耦合；升级 `YAADE_REF` 后若上游登录页、顶栏或主题文件结构变化，品牌补丁会主动失败并提示重新对齐
- 平台新增主题预设时，需要同步扩展 Yaade 品牌补丁中的主题 ID 白名单与 CSS 变量映射，否则 Yaade 会回退到默认 `sunset-orange` 主题
