# GitPilot Desktop 云端发布与在线升级技术设计 v1

## 1. 背景与范围

GitPilot Desktop 目前以 Tauri 2 + React 运行 Windows x64 本地工作台。该工作台需要一个与平台版本公告隔离的发布域，以支持已签名安装包的受控上传、公开下载和 Tauri updater 在线升级。

首期范围固定为：

- channel：`stable`
- platform：`windows`
- arch：`x86_64`
- bundle：`msi`、`nsis`
- 更新策略：用户确认后升级，不做强制升级、自动降级、beta 或跨平台产物

构建环境持有 Tauri 私钥并生成签名文件；仓库、后端和 MinIO 都不保存私钥。后端只保存发布元数据和签名后的产物，MinIO bucket 保持私有。

## 2. 总体架构

```text
受控构建环境
  └─ Tauri build/sign
      ├─ MSI / NSIS 安装器
      ├─ updater ZIP（MSI、NSIS）
      └─ updater .sig（MSI、NSIS）
              │ 管理端 multipart 上传
              ▼
Spring Boot backend
  ├─ desktop_release / desktop_release_artifact
  ├─ 私有 MinIO 对象
  ├─ 管理员发布、撤回、审计
  ├─ Tauri manifest：按 target/arch/bundle/version 选择
  └─ 公开最新版本与短期下载 URL
       ├─ GitPilot Desktop updater
       └─ /gitpilot 公众介绍页
```

发布域不复用 `platform_release`。后者面向平台公告和 Markdown 弹窗，而桌面发布需要二进制产物、架构、bundle、签名、对象存储和下载状态等生命周期字段。

## 3. 后端设计

### 3.1 数据模型

Flyway `V152__gitpilot_desktop_release_update.sql` 新增：

- `desktop_release`：版本号、渠道、平台、架构、标题、Markdown 更新说明、状态、发布时间、发布人和创建时间。
- `desktop_release_artifact`：产物类型、bundle 类型、文件名、MinIO 对象键、Content-Type、大小、SHA-256、Tauri 签名内容和下载状态。

版本在 `channel + version` 范围内唯一。发布记录状态为 `DRAFT`、`PUBLISHED`、`REVOKED`：草稿可替换产物，已发布记录不可编辑，撤回只影响后续公开清单和下载，不对已安装客户端降级。产物使用发布记录和矩阵字段建立唯一约束，防止同一格重复产生不可见副本。

发布前必须具备以下六格：

| Bundle | 安装器 | Updater | 签名 |
| --- | --- | --- | --- |
| `msi` | MSI | updater ZIP | `.sig` |
| `nsis` | NSIS EXE | updater ZIP | `.sig` |

### 3.2 管理接口

管理员接口受独立权限保护：

- `GET /api/desktop-releases`：分页读取草稿、已发布和已撤回记录。
- `GET /api/desktop-releases/admin/{id}`：读取发布详情及产物摘要。
- `POST /api/desktop-releases`：创建唯一 semver 草稿。
- `POST /api/desktop-releases/{id}/artifacts`：上传矩阵中的一个产物，后端流式写入 MinIO。
- `POST /api/desktop-releases/{id}/publish`：校验六格和签名后发布。
- `POST /api/desktop-releases/{id}/revoke`：撤回已发布版本。

写操作使用 `system:desktop-release:view` / `system:desktop-release:manage` 权限，并通过现有操作日志记录创建、上传、发布和撤回。上传文件名只作为展示信息保存，对象键由后端按发布 ID 和随机安全片段生成，避免客户端控制存储路径。

### 3.3 公开接口和 MinIO 边界

- `GET /api/desktop-releases/latest?channel=stable&platform=windows&arch=x86_64` 返回最新已发布版本、更新说明、发布时间、安装器大小、SHA-256 和后端下载地址。
- `GET /api/desktop-updates/{target}/{arch}/{bundle_type}/{current_version}` 返回 Tauri 2 动态清单；无更高版本或无匹配产物时返回 `204 No Content`。
- `GET /api/desktop-releases/artifacts/{id}/download` 仅允许已发布且可下载的产物，返回短期 MinIO presigned URL。

Tauri 清单不使用平台统一 `ApiResponse` 包装，字段保持 updater 协议要求：`version`、`notes`、`pub_date`、`url`、`signature`。选择逻辑严格匹配 target、arch、bundle，不把 MSI/NSIS 或其他平台产物互相回退。公开清单使用短期缓存，下载和发布撤回仍由后端二次校验。

## 4. Desktop 更新流程

### 4.1 配置和构建

`gitpilot-desktop/src-tauri/tauri.conf.json` 开启 `createUpdaterArtifacts`，配置生产 endpoint 占位符、公钥和 MSI/NSIS targets；`tauri-plugin-process` 提供 `process:default` relaunch 权限。公钥可以进入发布包，私钥只能通过构建环境的签名配置注入，不得提交到仓库。

`scripts/package-release.mjs` 在整理产物前校验 `package.json`、Cargo 和 Tauri 三处版本一致，并要求构建目录中存在 MSI、NSIS、updater ZIP 和 `.sig` 文件。输出目录按版本和产物类别分组，供管理端逐格上传。

生产部署前必须把 Tauri endpoint 中的示例域名替换为真实 HTTPS 域名，并确认对应私钥由受控发布环境安全保管。

### 4.2 状态机和交互

Desktop 使用独立 Zustand store 管理：

`idle → checking → available / up-to-date / error / unavailable`

发现更新后，用户在设置页查看版本、发布日期和 Markdown 说明，确认后进入：

`available → downloading → installing → relaunch`

下载回调将 `Started`、`Progress`、`Finished` 映射为进度条。安装严格走 Tauri updater 原生签名校验；校验失败直接进入错误态，不提供自行下载或未签名回退路径。网络错误在启动后台检查中静默处理，手动检查显示可读错误并允许重试。

应用启动后延迟执行一次后台检查，且不依赖登录、sidecar Agent 连接或当前页面。设置页提供“检查更新”入口。安装前检查 Agent 流式执行和应用终端会话，忙碌时保持更新可见但禁止下载/安装按钮，空闲后可再次确认。

## 5. 前端职责

### 5.1 管理端

`frontend` 新增独立路由 `/desktop-releases`、菜单入口和权限 taxonomy。页面支持创建草稿、填写 Markdown 更新说明、查看版本详情、按 MSI/NSIS 六格上传、显示 SHA-256 和大小、发布及撤回。发布按钮只有在六格全部存在时可用，已发布版本只显示撤回操作。

### 5.2 公众端

`frontend-public` 的 `/gitpilot` 在挂载后请求最新 stable API，不再拼接硬编码安装包路径。默认选择 NSIS，缺失时回退 MSI；页面展示版本、发布日期、文件大小和 SHA-256。接口暂时不可用时保留介绍页主体，并把下载操作降级为不可用提示。

## 6. 安全、可靠性与运维

- MinIO bucket 和对象键不公开，公开下载必须经过后端发布状态校验。
- 上传和下载采用专用大小限制；文件名、对象键和响应头进行安全归一化。
- 公开 endpoint 只读，管理写接口继续走登录、权限和审计链路。
- 撤回只阻断后续清单和下载，不删除已安装客户端数据，也不触发自动降级。
- Tauri signing key 不进入 Git、数据库、MinIO 或前端资源；公钥轮换需要新的 Desktop 构建和兼容发布策略。
- 当前版本只支持 Windows x64 stable，`channel`、`platform`、`arch`、`bundleType` 字段和 API 路由为后续扩展预留。

## 7. 验证与发布清单

发布前依次完成：

1. `gitpilot-desktop` 版本三处一致，执行 `npm run build`、`npm run test`、`cargo check`。
2. 生成 MSI、NSIS、两个 updater ZIP 和两个 `.sig`，执行 `npm run release:artifacts`。
3. 管理端创建草稿并上传六格；确认后端拒绝缺少产物或签名的发布。
4. 公开接口验证旧版本返回清单、最新版本返回 `204`、不匹配 target/arch/bundle 返回 `204`。
5. 用旧 Desktop 做 Windows 冒烟：检查、确认、下载、签名校验、安装重启，并确认本地会话数据保留。
6. 撤回版本后验证新下载和 updater 清单不可用，已安装客户端不被降级。

当前环境可以执行自动化测试、构建、Cargo 检查和编码检查；真实签名安装升级需要 Windows 安装器、对应私钥和可访问部署端点，不能用仓库内临时公钥替代生产冒烟。
