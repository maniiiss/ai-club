## Context

GitPilot Desktop 使用 Tauri 2、React 19 和 Windows x64 sidecar。当前 `tauri-plugin-updater` 已注册，但 `pubkey` 和 `endpoints` 为空，`createUpdaterArtifacts` 也未开启；现有 `platform_release` 只保存面向公众端的 Markdown 版本说明，不能表达安装包、架构、bundle 类型或签名。平台已有 MinIO 访问配置和管理员权限体系，但没有桌面产物发布域。

首期只覆盖 Windows x64 stable。发布者在本地或受控构建环境生成 Tauri 安装包和签名 updater 产物，再通过管理端上传；后端负责元数据、私有对象存储、公开清单和下载，不持有 Tauri 私钥。

## Goals / Non-Goals

**Goals:**

- 建立可审计的桌面版本草稿、发布和撤回流程。
- 让未登录的旧 Desktop 能获取公开 updater 清单并下载签名产物。
- 让 Desktop 在启动后台检查、用户确认后安全下载、安装和重启。
- 让 `/gitpilot` 公开页展示最新稳定版和 MSI/NSIS 下载入口。
- 保持发布域与现有平台版本说明域隔离，并为未来渠道、多平台和架构扩展预留字段。

**Non-Goals:**

- 不实现 CI 自动构建、自动发布、beta 渠道、强制升级或自动降级。
- 不实现 macOS/Linux 产物和 Windows Authenticode 证书管理。
- 不让浏览器或 Desktop 直接访问 MinIO bucket。

## Decisions

### 1. 独立桌面发布模型

新增 `desktop_release` 和 `desktop_release_artifact` 两张表。发布记录保存版本、channel、release notes、状态、发布时间和发布人；产物记录保存 platform、arch、bundleType、artifactKind、文件名、对象键、大小、SHA-256、content type 和 Tauri signature。草稿允许补传和替换产物，发布后不可编辑；撤回只影响后续公开查询。

发布前校验 stable + windows + x86_64 的安装包和 updater 产物均存在，且 updater 产物有非空 `.sig` 内容。版本按 channel + semver 唯一，公开查询只选择 PUBLISHED 且未撤回的最高版本。

选择独立模型而不是扩展 `platform_release`，因为现有表的用户展示关系、Markdown 内容和管理员语义与二进制发布生命周期不同；分离可以避免影响已有公众端版本弹窗。

### 2. 私有 MinIO + 后端公开下载

管理员上传接口使用 multipart，后端以流式方式写入固定前缀下的 MinIO 对象，并在数据库保存对象键。公开下载接口校验产物属于已发布版本后，生成短期 presigned URL 并重定向，或由后端安全转发；不公开 bucket 和原始对象键。上传大小通过桌面发布专用配置限制，避免把安装包完整读入 JVM 内存。

选择后端控制下载而不是公开 bucket，是为了保留撤回、审计、对象键隔离和未来 CDN/下载统计能力。

### 3. Tauri 动态更新契约

配置 endpoint 使用 `{{target}}`、`{{arch}}`、`{{bundle_type}}` 和 `{{current_version}}` 占位符。公开更新接口按请求目标选择对应 updater 产物：没有更高版本或没有匹配产物返回 `204 No Content`；有更新返回 Tauri 2 动态格式：

```json
{
  "version": "0.2.0",
  "notes": "Markdown release notes",
  "pub_date": "2026-08-18T10:00:00Z",
  "url": "https://platform.example/api/desktop-releases/artifacts/12/download",
  "signature": "contents of the .sig file"
}
```

签名公钥编译进 Desktop 配置，私钥只用于构建签名，不进入仓库、数据库或 MinIO。客户端使用 Tauri updater 原生校验，服务端不接受未签名 updater 作为可发布产物。

### 4. Desktop 更新状态与交互

新增独立 update service/store，不把更新状态混入 Agent session。应用加载后延迟执行一次后台检查；设置页增加“版本与更新”分区和手动检查入口。用户确认后调用 `check`、`download`、`install` 和 process plugin 的 `relaunch`，展示 Started/Progress/Finished 进度。

更新安装前检查 Agent streaming 状态和应用内 PowerShell 会话；忙碌时只允许稍后安装。后台检查网络错误不阻塞登录或工作台，手动检查显示错误。非 Tauri mock 环境不触发真实更新调用。

选择原生 Tauri updater 而不是 React 自行下载/替换，是为了使用其签名校验、安装器替换和平台重启能力，并保持 React 不直接接触文件系统。

### 5. 管理端与公开页

管理端新增独立“桌面版本发布”菜单和页面，流程为创建草稿 → 上传各产物 → 预览校验 → 发布/撤回。公开 `/gitpilot` 页面调用最新版本元数据接口，默认 NSIS 下载并提供 MSI 备用下载、版本号、发布日期、文件大小和 SHA-256。

## Risks / Trade-offs

- [大文件上传占用后端资源] → 使用 MinIO 流式上传、单文件大小配置和明确的 multipart 超时；后续可改为 presigned multipart upload。
- [发布错误产物导致升级失败] → 发布前强制校验产物矩阵、签名非空和对象存在；客户端签名失败时拒绝安装。
- [撤回无法让已升级客户端自动降级] → 首期明确只做撤回新下载；问题版本通过撤回并发布修复版本解决。
- [Tauri bundle type 与安装器不匹配] → 发布产物按 `bundleType` 分开记录，更新端点按请求的 target/arch/bundleType 精确选择，并做真实 MSI/NSIS 冒烟。
- [现有版本号分散在 package、Cargo 和 Tauri 配置] → 发布打包脚本在构建前校验三处版本一致，版本不一致直接失败。
- [公开更新端点被滥用] → 仅开放只读清单/下载、使用 HTTPS、缓存公开清单、限制下载路由的请求头和对象范围；管理员写接口继续使用权限校验。

## Migration Plan

1. 部署数据库迁移、权限和后端接口；未发布任何桌面版本时公开更新接口返回 `204`。
2. 生成并安全保存 Tauri signing key，配置公钥和生产更新 endpoint。
3. 构建并上传第一个 Windows x64 stable 版本，完成后台发布前校验。
4. 先用 `/gitpilot` 验证公开下载，再用旧 Desktop 验证 `204`、有更新、签名校验和重启流程。
5. 如需回滚，撤回当前版本并停止公开其产物；客户端保留当前版本，不自动降级。

## Open Questions

- 后续如需要 beta 或租户私有渠道，再增加渠道筛选和访问策略；本次不提前实现。
- Windows Authenticode 签名证书由发布基础设施另行确定，本次只保证 Tauri updater 签名链路。
