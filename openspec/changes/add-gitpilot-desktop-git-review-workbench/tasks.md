## 1. 协议与安全基线

- [ ] 1.1 为 Git RPC、ReviewSnapshot、ReviewFinding 和运行事件建立共享 TypeScript 类型与 JSON 契约样例
- [ ] 1.2 实现 Git 可执行检测、仓库根规范化、路径归属校验和白名单命令策略单元测试
- [ ] 1.3 建立临时 Git 仓库测试夹具，覆盖中文/空格路径、重命名、冲突、detached HEAD、worktree 和 bare remote
- [ ] 1.4 为每仓库写操作互斥、operationId、取消和 repositoryVersion 建立基础服务与并发测试

## 2. Sidecar 只读 Git 能力

- [ ] 2.1 实现 porcelain v2 `-z` 状态解析、分支/upstream/ahead/behind 和变更分组
- [ ] 2.2 实现工作区、暂存区和 base...head Diff 查询，覆盖行号、二进制、重命名和截断元数据
- [ ] 2.3 实现分支列表、提交历史、remote 规范化和 GitLab host/projectPath 解析
- [ ] 2.4 增加 `git_get_state`、`git_get_diff`、`git_get_log`、`git_list_branches`、`git_get_remote_context` RPC handler 与契约测试
- [ ] 2.5 实现工作台可见期仓库观察、500ms 去抖、2 秒限频和 5 秒轮询降级

## 3. Desktop 源代码管理工作台

- [ ] 3.1 在现有 shadcn 工作台中增加对话/源代码管理模式和 Git 不可用、非仓库、加载、空状态
- [ ] 3.2 实现分支摘要、变更分组、文件虚拟列表、状态徽标和手动刷新
- [ ] 3.3 实现按文件懒加载的 unified/split Diff Viewer、行号锚点、二进制与截断提示
- [ ] 3.4 增加 Git Zustand store，处理 repositoryVersion、防过期响应和项目/session 切换清理
- [ ] 3.5 为窄窗口 Sheet、键盘导航、滚动定位、中文路径和大文件列表补充组件测试

## 4. 安全 Git 写操作

- [ ] 4.1 实现按路径暂存/取消暂存、反向动作和操作后强制状态刷新
- [ ] 4.2 实现提交预览、提交消息校验、hooks/签名错误透传和 commit SHA 回执
- [ ] 4.3 实现创建/切换分支，并在本地变更阻断时保持工作区不变
- [ ] 4.4 实现 Fetch、`pull --ff-only` 和非 force Push，拒绝删除 refspec 与所有 force 变体
- [ ] 4.5 为提交、分支和远程操作增加确认 Dialog、真实进度、取消、错误与冲突引导
- [ ] 4.6 使用临时 remote 完成 stage/commit/branch/fetch/pull/push 集成测试和失败恢复测试

## 5. 通用结构化审查引擎

- [ ] 5.1 在 code-processing 增加结构化 finding schema、中文提示词、路径/行号输出约束和兼容旧响应的解析
- [ ] 5.2 在 backend 抽取 `ChangeReviewService`，让现有 MR 自动合并适配器继续消费旧 `approved/issues/reviewMarkdown`
- [ ] 5.3 实现严重级别门禁、finding 指纹、路径/行号校验、覆盖率和未覆盖文件汇总
- [ ] 5.4 增加 previousReviewId 复审匹配与 NEW/UNCHANGED/RESOLVED 状态，不覆盖历史结果
- [ ] 5.5 运行 code-processing review 测试和 backend 自动合并相关 JUnit，验证 wire format 向后兼容

## 6. 平台审查运行与治理

- [ ] 6.1 新增审查运行、finding、feedback 和 publication Flyway 表、实体、Repository 与状态机
- [ ] 6.2 实现 Redis 加密短期 Diff 载荷、30 分钟 TTL、完成后删除和 PAYLOAD_EXPIRED 失败语义
- [ ] 6.3 增加 `cli:code-review:execute/read/publish` scope 与创建、查询、取消 API 的所有权测试
- [ ] 6.4 实现异步 worker、模型配置解析、code-processing 调用、用量关联和无源码日志审计
- [ ] 6.5 实现 sidecar ReviewSnapshot 构建、绝对路径剥离、digest/fingerprint 计算和平台轮询客户端
- [ ] 6.6 增加 `review_start/get/cancel` RPC 与 progress/completed 事件契约测试

## 7. Desktop 代码审查体验

- [ ] 7.1 实现 WORKTREE/STAGED/BRANCH/MERGE_REQUEST 范围选择、base/head 预览、上传范围和首次隐私确认
- [ ] 7.2 在右侧检查器增加审查结论、严重级别/类别过滤、finding 列表、覆盖率和未覆盖范围
- [ ] 7.3 实现 finding 到 Diff 行的跳转、无效定位降级、代码变化过期提示和重新审查
- [ ] 7.4 实现复审历史、NEW/UNCHANGED/RESOLVED 对比和误报/接受风险/已处理反馈
- [ ] 7.5 实现“交给 Agent 修复”的结构化指令填充，确保不会自动修改、提交或推送
- [ ] 7.6 覆盖平台离线、取消、载荷过期、快照变化、超大 Diff 和项目切换的 store/组件测试

## 8. GitLab MR 解析与显式发布

- [ ] 8.1 实现 backend 按精确 host/projectPath 匹配当前用户可见 GitLab binding 和开放 MR
- [ ] 8.2 实现 `review_publish` API、snapshot SHA 再校验、publish scope、幂等键和 publication 审计
- [ ] 8.3 首版以单条可更新 Markdown 总评发布，验证网络超时重试不会重复刷评论
- [ ] 8.4 在 Desktop 增加未关联仓库、MR 选择、发布确认、过期结果阻断和已发布回执
- [ ] 8.5 增加越权仓库、他人 reviewId、无 publish scope、MR SHA 变化和重复发布测试

## 9. 文档、性能与交付验证

- [ ] 9.1 同步正式专题设计、`docs/design-docs/index.md`、`docs/architecture.md` 和 RPC/API 契约说明
- [ ] 9.2 使用 2,000+ 变更文件和大 Diff 仓库验证分页、懒加载、内存、IPC 大小和刷新限频
- [ ] 9.3 运行 Desktop Vitest/build、CLI/RPC 测试、code-processing review 测试、相关 JUnit 和全仓编码检查
- [ ] 9.4 在真实 Tauri Windows 应用完成 Git 缺失、状态、Diff、暂存、提交、分支、远程同步、审查、取消和 MR 发布冒烟
- [ ] 9.5 按只读 Git、写操作、平台审查、MR 发布四个能力开关分阶段发布并记录回滚演练结果
