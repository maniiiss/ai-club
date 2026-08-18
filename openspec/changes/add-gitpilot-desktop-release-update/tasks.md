## 1. Backend data model and permissions

- [x] 1.1 Add Flyway migration for desktop releases, artifacts, statuses, channel/platform metadata and indexes.
- [x] 1.2 Add desktop release/artifact entities, repositories, DTOs and request validation with Chinese business-intent comments.
- [x] 1.3 Add desktop release view/manage permissions and seed them for existing administrator roles.
- [x] 1.4 Add MinIO streaming storage service for release uploads, metadata calculation and private-object reads.

## 2. Backend release APIs

- [x] 2.1 Implement draft creation, admin listing/detail and artifact multipart upload endpoints.
- [x] 2.2 Implement publish/revoke transitions with semver uniqueness and required artifact matrix validation.
- [x] 2.3 Implement public latest metadata and published-artifact download endpoints without authentication.
- [x] 2.4 Implement Tauri dynamic updater endpoint with target/arch/bundle selection and `204 No Content` behavior.
- [x] 2.5 Add operation logging, public cache headers, safe filename handling and upload/download size limits.
- [x] 2.6 Add backend unit and controller tests for permissions, lifecycle, validation, manifest selection and revoked downloads.

## 3. Desktop updater runtime

- [x] 3.1 Add Tauri updater artifact generation, production endpoint, public key configuration and process relaunch dependency/permissions.
- [x] 3.2 Add version consistency and release artifact packaging script for MSI, NSIS, updater archives and signatures.
- [x] 3.3 Implement React update service/store with startup check, manual check, progress, install and error states.
- [x] 3.4 Wire update checks into application startup without coupling them to login or Agent connection.
- [x] 3.5 Add settings update section and update dialog with release notes, progress, retry and confirmation states.
- [x] 3.6 Block installation during active Agent streaming or application terminal sessions; support safe preview/mock mode.
- [x] 3.7 Add Desktop Vitest coverage for state transitions, no-update, failure, signature/install errors and busy protection.

## 4. Admin and public web UI

- [x] 4.1 Add management frontend API/types and desktop release route/menu with permission gating.
- [x] 4.2 Implement admin release page for draft metadata, artifact uploads, validation, publish and revoke actions.
- [x] 4.3 Add public desktop release API/types and update `/gitpilot` to render latest stable version and installer links.
- [x] 4.4 Add frontend and frontend-public tests for upload lifecycle, permission states, fallback and dynamic download links.

## 5. Documentation and verification

- [x] 5.1 Add the formal desktop release/update technical design and synchronize architecture and design indexes.
- [x] 5.2 Run Desktop tests/build/Cargo check, backend related JUnit tests, management build, public tests/build and encoding check.
  - 验证记录：Desktop Vitest 214/214、后端发布与匿名公开路径 JUnit 12/12、公众端桌面发布专项 2/2、管理端桌面发布专项 3/3 均通过；管理端全量测试和公众端全量测试各有 1 条既有无关基线断言失败，构建与编码检查通过。
- [ ] 5.3 Run GitNexus detect-changes and verify the changed scope matches this release/update feature.
  - 当前 GitNexus CLI 未提供 `detect-changes` 子命令，已执行 `analyze`、`status`、核心已索引符号 upstream impact，并以特性路径白名单完成手工范围核对；待具备对应 MCP/CLI 能力后补跑原命令。
- [ ] 5.4 Perform a Windows signed artifact smoke test from an older installed version through update and relaunch.
  - 当前环境缺少生产 Tauri 私钥、可访问发布端点和完整 updater ZIP/.sig，无法安全执行真实签名安装重启冒烟。
