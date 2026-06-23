# API Studio 前端重写设计（取代 Yaade iframe + 构建期补丁）

- 状态：草案 v1，待评审
- 日期：2026-06-23
- 负责模块：`frontend/src/modules/api-studio/`、`backend/.../yaade/**`、`docker/yaade/**`
- 关联文档：`docs/generated/yaade-integration-technical-design-v1.md`

## 1. 背景与目标

当前 `/apis` 菜单是 Yaade 上游前端的 iframe 嵌入，靠两个构建期补丁脚本
`docker/yaade/scripts/apply-zh-cn.mjs`（632 行）与
`docker/yaade/scripts/apply-aiclub-branding.mjs`（1135 行）在 Yaade 源码上做中文化、品牌色、隐藏顶栏、SSO loading、postMessage 项目上下文等改造。这套方案当前带来的代价：

- 视觉风格仍是 Chakra UI，与平台 Element Plus 控制台并存，密度/字体/间距/交互节奏长期割裂。
- 每次升级 `YAADE_REF`，补丁脚本都需要重新对齐选择器与 className，是脆弱点。
- 平台已经在 backend 写了 `YaadeClientService / YaadeApiCatalogService / YaadeProjectSyncService` 等服务，证明把 Yaade 当成"纯数据后端"完全可行。

**本次目标**：在 `frontend/` 内用 Vue 3 + Element Plus 重写一套"API Studio"前端，1:1 覆盖 Yaade 现有能力（Collection 树、Request 编辑/发送、Response、环境变量、Cookie、历史、脚本、JWT、文件附件、OpenAPI 导入导出、Mock、自动化测试 Runner），把 Yaade 镜像收敛为只跑 server，最终拿掉 iframe + 两个补丁脚本。

**非目标**：

- 不迁移 Yaade H2 数据；Yaade 仍是唯一接口资产存储。
- 不引入新的 UI 框架（不上 Tailwind、不上 Headless UI、不嵌 Hoppscotch 等开源 SDK）。
- 不动 Yaade 后端代码或后端协议；只通过其 REST API 与之交互。
- 不引入新的鉴权协议（OIDC/SSO 等），仍走平台 Bearer Token + 后端代登。

## 2. 既有事实与约束

以下条目是 brainstorming 阶段已确认的约束，**所有实现必须遵守**：

1. **功能范围**：1:1 对齐 Yaade 当前能力。
2. **迁移策略**：在原 `/apis` 路由上原地重写，分能力切片落地；每次合并到主干前形态必须用户可用，不允许半残废中间态。
3. **数据通路**：前端默认走 `/api/yaade/proxy/...` 透传；只有在需要"项目隔离 / 越权防护 / 跨服务编排"等场景才落到平台封装接口（如 `/api/yaade/projects/{id}/...`）。
4. **UI 体系**：Element Plus + Monaco Editor，不引入第二套组件库。
5. **数据复用**：Yaade H2 零迁移；Yaade 是 API Studio 的纯数据后端。
6. **会话模型**：拿掉 `embed-session` HttpOnly cookie 链路。前端只持平台 Bearer Token，Yaade 远端 cookie 由 backend 内存中按用户分桶持有，不回浏览器。
7. **项目作用域**：项目隔离在 backend proxy 层落地，前端拿到的就是"已经按项目过滤的视图"。
8. **AI 入口**：AI 测试用例从浮动按钮收口到 Request 详情页内部（菜单/按钮形式）。
9. **清栈**：迭代末期删除 `apply-zh-cn.mjs`、`apply-aiclub-branding.mjs`、Dockerfile 的 `client-builder` 阶段、`YaadeEmbedSessionService` 中 iframe 专用逻辑、`YaadeProxyController` 中的 HTML / asset 改写。

## 3. 架构总览

```
浏览器 (Vue 3 SPA)
  └─ /apis/...  (新前端)
       │ Bearer Token
       ▼
平台 backend (Spring Boot)
  ├─ YaadeProjectScopedProxyService   (新)  项目过滤 / 写入注入 / 资源归属校验
  ├─ YaadeProxyController             (改)  路径升级为 /api/yaade/proxy/projects/{pid}/**
  ├─ YaadeClientService               (改)  增加 "按平台用户取/缓存 Yaade cookie" 能力
  ├─ YaadeApiCatalogService           (留)  AI 用例链路保持
  └─ YaadeEmbedSessionService         (减)  iframe 专用部分迭代末期删除
       │ 用户级 Yaade cookie（后端持有，不回浏览器）
       ▼
Yaade Kotlin / Vert.x 服务 (H2 + 文件存储)
```

设计原则：

- **前端不直接访问 Yaade 原始地址。**
- **后端是项目作用域翻译层。** 把"平台用户 + 项目 ID"翻译成"Yaade group + Yaade cookie"。
- **Yaade 不感知项目语义。** 所有项目隔离规则都在 backend 落地。

## 4. 前端设计

### 4.1 目录结构

```
frontend/src/modules/api-studio/
  router.ts
  views/
    ApiStudioLayout.vue        # 左树 / 中 tab / 右下 response 的总布局
    ApiGroupListView.vue       # /apis GROUP 列表（项目卡片）
    ApiWorkbenchView.vue       # /apis/projects/:projectId 项目工作台
  components/
    collection-tree/           # 左侧 Collection / Folder / Request 树
    request-tabs/              # 中部多 tab 容器（Postman 风格）
    request-editor/            # URL bar、Params、Headers、Body、Auth、Pre-request、Tests
    response-viewer/           # Body / Headers / Cookies / Timeline
    env-manager/               # 环境变量、Cookie、JWT 工具
    history-panel/
    importer/                  # OpenAPI / cURL / Yaade JSON 导入导出
    runner/                    # 自动化测试 Runner
    mock/                      # Mock server
    ai/                        # AI 测试用例 Drawer（迁自现 ProjectApiManagementView）
  stores/
    useApiStudioSessionStore.ts   # 当前项目、用户、Yaade 健康状态
    useCollectionsStore.ts        # collections 树结构
    useRequestTabsStore.ts        # 打开的 request 标签、未保存草稿
    useEnvironmentStore.ts        # 环境变量、当前激活环境
    useHistoryStore.ts            # 发送历史
    useRunnerStore.ts             # Runner 运行结果
  api/
    yaade-rest.ts              # 包装 /api/yaade/proxy/projects/{pid}/** 调用
    yaade-platform.ts          # 包装平台扩展接口（AI 用例、binding 修复等）
  types/
    yaade.ts                   # Yaade REST DTO
    api-studio.ts              # 前端内部展示类型
```

### 4.2 路由

- `/apis`：GROUP 列表，沿用 `ApiGroupListView`，只是从 Element Plus 重做卡片。
- `/apis/projects/:projectId`：项目工作台，左侧 Collection 树 + 中部 Request 标签 + 底/右 Response。
- `/apis/projects/:projectId/collections/:collectionId/requests/:requestId`：用于直接打开某个 Request 时回填 tab。
- 路由进入守卫：
  1. 校验用户对该项目可见；
  2. 触发后端 `POST /api/yaade/projects/{pid}/ensure-binding`（沿用既有 `repair-sync` 或新增轻量版），保证 Yaade 侧 group/collection 就绪；
  3. 加载 `useApiStudioSessionStore`。

### 4.3 状态管理

- 使用 Pinia，每个 store 单一职责（见 4.1 目录）。
- **不允许**出现"上帝 store"。Request tab 草稿、Collection 树、环境变量、历史记录分别独立。
- 跨 store 协作通过事件总线？不，通过显式调用 store action，禁止隐式订阅。

### 4.4 与平台壳的关系

- 继续在 `AppLayout` 内承载，`ApiStudioLayout` 只接管主内容区。
- 平台顶栏、Hermes 助手、消息中心、用户菜单照常显示；不再做"嵌入模式隐藏顶栏"。
- 平台主题切换：API Studio 通过 CSS 变量自动跟随，不需要消息桥接，不需要 `aiclubTheme` 参数。

### 4.5 代码编辑器

- Body / Pre-request / Tests / Response 使用 Monaco，复用平台现有 Monaco 引入方式（搜代码确认；若没有则补一个轻量按需加载工厂）。
- JSON / XML 高亮、formatter、search 都靠 Monaco 自带能力。

### 4.6 AI 测试用例入口

- 删除 `ProjectApiManagementView.vue` 的浮动 `api-ai-trigger` 按钮。
- 在 `request-tabs` 中每个 Request tab 的右上 toolbar 增加"AI 测试用例"按钮；点击打开 `components/ai/AiTestCaseDrawer.vue`。
- Drawer 内部复用现有 `generateYaadeApiTestCases` 接口，不改后端。

## 5. 后端设计

### 5.1 路径变化

`YaadeProxyController` 路径从：

```
/api/yaade/proxy/**          → 通配整个 Yaade REST
```

升级为：

```
/api/yaade/proxy/projects/{projectId}/**     # 项目作用域
/api/yaade/proxy/public/**                   # 公共空间（aiclub-api-public group）
```

旧的无作用域 `/api/yaade/proxy/**` 路由在切片 1–5 过渡期保留（仅供老 iframe view 使用），在**切片 8** 与补丁脚本一并删除（切片 6 完成时前端已没有调用方）。

### 5.2 `YaadeProjectScopedProxyService`

职责：

1. **入参校验**：用户对 `projectId` 的可见性、项目绑定状态（`platform_yaade_project_binding`）。
2. **请求重写**：
   - 写入类接口（`POST /api/collection`、`PUT /api/collection/{id}` 等）强制把 `groups` 收敛为 `["aiclub-project-{projectId}"]`（或 `aiclub-api-public`）。前端传的 groups 仅做参考，不直接采用。
   - 资源类接口（`/api/collection/{id}`、`/api/request/{id}` 等）在转发前先用 backend 缓存的"资源 → groupName"映射做归属校验，越权直接 403。
3. **响应过滤**：
   - 列表类接口（`GET /api/collection`）按当前项目 group 过滤。
   - 其它响应一般不做改写，除非涉及包含其它项目数据（如 `GET /api/environment`、`GET /api/jwt` 等）。
4. **接口分类清单**作为该服务唯一真相源（whitelist），未在清单内的路径默认拒绝，避免上游加新接口时静默放行。

### 5.3 鉴权与 Yaade cookie 缓存

- 前端请求统一带平台 Bearer Token，后端解析出 `userId`。
- `YaadeClientService` 增加：

  ```java
  String getOrLoginUserCookie(long platformUserId);
  void invalidateUserCookie(long platformUserId);
  ```

- cookie 缓存：`Map<platformUserId, RemoteCookieSnapshot>`，带 TTL（沿用 `platform.yaade.proxy-session-ttl-minutes` 配置语义；或新增 `platform.yaade.user-cookie-ttl-minutes`）。
- 调用 Yaade 返回 401 时，先 `invalidateUserCookie` 再重试一次；连续两次失败回 5xx。
- 浏览器侧**不再有 HttpOnly cookie**；登出时只需让 backend 缓存失效。

### 5.4 公共空间

- 沿用 `aiclub-api-public` group；前端路由通过 `/apis/projects/public` 或专门路由 `/apis/public` 展示，对应后端 `/api/yaade/proxy/public/**`。

### 5.5 公开接口范围

- 平台扩展接口 `/api/yaade/...`（health、embed-session（迭代末期删除）、projects/{id}/binding、projects/{id}/requests、projects/{id}/requests/{rid}/ai-test-cases、projects/{id}/repair-sync）继续保留；新前端用到的仍是其中的 binding、requests、ai-test-cases、repair-sync、health。
- 不新增"平台封装版 collection / environment / history"接口（除非后续审计需求触发）。

## 6. 切片节奏（每片合并即可用）

切片之间用 Feature Flag `frontend.apiStudio.enabled`（默认 false → 渐进开启）控制路由是否切换到新前端。Feature Flag 在第 6 片关闭并删除。

| # | 切片 | 用户可见交付 | 后端动作 |
|---|------|--------------|----------|
| 1 | 基础设施 + 只读 MVP | 新 `/apis` GROUP 列表 + 进入项目后的左树 + 单 Request 只读查看。功能开关默认关闭，旧 iframe 仍是默认体验。 | 新增 `/api/yaade/proxy/projects/{pid}/**` 路由 + `YaadeProjectScopedProxyService` 骨架（只支持 collection list / request 详情） |
| 2 | Request 编辑 + 发送 + Response 查看 | URL、Params、Headers、Body（JSON/Form/Text）、Auth；Response Body/Headers/Cookies/Time。Feature Flag 默认开启，旧 iframe 仍可切回。 | proxy 支持 `POST /api/request/send` 与 collection / request / folder CRUD；写入注入 groups |
| 3 | 环境变量 + 变量插值 + Cookie 管理 + JWT 工具 | 环境变量管理面板、`{{var}}` 插值、Cookie 面板、JWT 生成 | proxy 支持 environment、cookie、jwt 相关 endpoint |
| 4 | 历史记录 | 历史记录面板、按 collection / 时间过滤、重发 | proxy 支持 history endpoint |
| 5 | 脚本（Pre-request / Tests）+ 文件附件 | Monaco 编辑脚本、Tests 结果可视化、附件上传/下载 | proxy 支持 script run、file upload/download |
| 6 | OpenAPI 导入导出 + cURL 解析 + Yaade JSON 导入导出 | 导入导出向导。**到此 1:1 对齐完成，Feature Flag 默认开启，前端老 iframe view（`ProjectApiManagementView.vue` 现有实现）替换为新前端入口并删除。** | proxy 支持 import/export endpoint |
| 7 | Mock + 自动化测试 Runner | Mock server 管理、Runner 执行视图 | proxy 支持 mock / runner endpoint |
| 8 | 清栈 | 用户无感知 | 删除 `apply-zh-cn.mjs`、`apply-aiclub-branding.mjs`、Dockerfile 的 `client-builder` 阶段；删除 `YaadeProxyController` 中 HTML / asset 改写；删除 `YaadeEmbedSessionService` 中 iframe 专用部分；删除无作用域 `/api/yaade/proxy/**` 旧路由（仅保留 `/projects/{pid}/**` 与 `/public/**`）；Yaade 镜像收敛为 server-only |

**每个切片完成定义**：

1. 切片内所有功能在新前端可用；
2. 通过 `python scripts/check_encoding.py`；
3. `cd backend && mvn -s maven-settings-central.xml test` 相关测试通过；
4. `cd frontend && npm run build` 通过；
5. 切片自带回归 checklist（手工列出该片覆盖的 Yaade endpoint，逐项点击通过）。

## 7. 数据模型与外部依赖

- **平台 MySQL**：不新增表。`platform_yaade_project_binding` / `platform_yaade_user_binding` 沿用。
- **Yaade H2**：不动。
- **环境变量**：可能新增
  - `platform.yaade.user-cookie-ttl-minutes`（沿用现有 `proxy-session-ttl-minutes` 也可）。
  - `frontend.apiStudio.enabled` Feature Flag。

## 8. 错误处理 / 降级

- **Yaade 健康检查失败**：`/apis` 显示与当前一致的"Yaade 暂时不可用"页面（沿用 `el-result` 模板）。
- **后端代登失败**：返回 503 + 明确提示"代登失败，请联系管理员"，前端不允许重试风暴（指数退避）。
- **proxy 越权拒绝**：返回 403 + `code: YAADE_RESOURCE_OUT_OF_SCOPE`，前端 toast 并清当前 tab。
- **proxy 白名单未覆盖**：返回 501 + `code: YAADE_ENDPOINT_NOT_WHITELISTED`，前端把请求拍到错误日志，提示"该功能尚未在新前端开放"。这条用于发现升级 `YAADE_REF` 后上游新增接口。

## 9. 测试策略

- **后端单元/集成**：
  - `YaadeProjectScopedProxyServiceTests`：列表过滤、写入注入、归属校验、白名单拒绝。
  - 现有 `YaadeProxyController` 测试改造为 project-scoped 路径版本。
- **前端单测**：
  - Pinia store 行为测试（草稿、未保存检测、tab 关闭警告等）。
  - 关键组件渲染测试（Collection 树、Request 编辑 toolbar、Response Timeline）。
- **手工回归 checklist**：每个切片末尾补充，覆盖该片对应的 Yaade endpoint。
- **跨服务验证**：迭代末期至少跑一次 `scripts/start.ps1`（或 Linux 等价脚本），确保 Yaade 镜像 server-only 模式下平台 `/apis` 完整可用。

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `YaadeProjectScopedProxyService` 的接口白名单遗漏，导致某些功能切片上线后用户撞 501 | 每个切片提交前必须更新白名单清单 + 提交对应单测；CI 校验白名单清单与文档一致 |
| 后端 cookie 缓存内存膨胀（每用户一份）| 设 TTL + LRU 上限；监控指标 `yaade.user_cookie_cache.size` |
| Yaade 上游升级 `YAADE_REF` 后协议变更 | 白名单 + 后端代登都跑契约测试（手工 smoke 或定期回归）；client builder 不再 build，但保留官方源码 clone 用于 server build |
| Monaco 体积影响 `/apis` 首屏 | 按需加载；仅 Body/Tests/Response 三处用到时再 import |
| Feature Flag 切换不当导致老用户进入半残废切片 | Flag 默认 false，切片 6 完成前不强制开启；运营/管理员可对个别用户/项目开启灰度 |
| 公共空间在新前端遗漏入口 | 路由设计阶段就保留 `/apis/public` 占位，与项目工作台共用布局 |

## 11. 验证清单（合并主干前必跑）

- `python scripts/check_encoding.py`
- `cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeProjectScopedProxyServiceTests,YaadeProxyControllerTests,YaadeClientServiceTests' test`
- `cd frontend && npm run build`
- 手工：`POST http://localhost:9339/api/yaade/proxy/projects/{pid}/api/login` 走通；新前端在该项目下能完成切片范围内所有操作。

## 12. 待决问题（不阻塞进入实现计划）

- Feature Flag 用环境变量、平台运营开关，还是按用户灰度？默认建议运营开关（DB 配置），按用户灰度作为切片 6 前的过渡。
- `platform.yaade.user-cookie-ttl-minutes` 默认值？建议 30 分钟，与现 `proxy-session-ttl-minutes` 对齐。
- 公共空间是否完全保持隐式入口（仅在某些项目下浮现），还是显式在顶部加 tab？建议显式，避免 iframe 时期"找不到入口"的老问题。

这些问题进入实施计划阶段再决，不影响架构与切片节奏。
