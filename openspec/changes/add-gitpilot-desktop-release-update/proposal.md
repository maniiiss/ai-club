## Why

GitPilot Desktop 当前只有 Tauri updater 依赖和空配置，缺少签名产物、版本清单、云端文件存储和用户可见的升级流程。Windows 用户必须手工获取新安装包，平台也没有独立的桌面版本发布与撤回能力，因此现在需要建立稳定版发布、公开下载和在线升级闭环。

## What Changes

- 新增独立桌面版本发布领域，支持草稿、发布、撤回和管理员审计。
- 管理端直接上传已签名的 MSI、NSIS、updater ZIP 与 `.sig` 产物，后端流式写入私有 MinIO。
- 新增公开 Tauri updater 清单、公开最新版本元数据和安全下载接口，未登录也可使用。
- Desktop 启动后台检查更新，设置页支持手动检查，用户确认后显示进度、安装并重启。
- 更新 `/gitpilot` 公开介绍页，从版本接口读取最新 Windows stable 下载信息。
- 补充 Tauri updater artifact 生成、签名公钥、relaunch 权限、发布打包脚本和架构文档。

## Capabilities

### New Capabilities

- `desktop-release-management`: 管理端桌面版本、产物上传、发布/撤回，以及公开版本清单和下载能力。
- `desktop-online-update`: Tauri Desktop 的版本检查、下载、签名安装、忙碌状态保护和重启流程。

### Modified Capabilities

<!-- 当前 openspec/specs 下没有需要修改的既有能力规格。 -->

## Impact

- Backend：新增 Flyway 表、领域实体、MinIO 存储服务、管理员/公开 Controller、DTO、权限和 JUnit 测试。
- `gitpilot-desktop`：修改 Tauri updater 配置、Rust 插件权限、React 更新状态与设置 UI、构建打包脚本和 Vitest 测试。
- `frontend`：新增桌面发布管理页面、API、类型和权限路由。
- `frontend-public`：将 `/gitpilot` 硬编码下载链接改为公开版本接口驱动。
- 文档：新增桌面发布升级技术设计并同步架构总览与设计索引。
