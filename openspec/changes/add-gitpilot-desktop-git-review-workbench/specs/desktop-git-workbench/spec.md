## ADDED Requirements

### Requirement: Desktop 识别当前 Git 仓库并展示机器可验证状态
系统 SHALL 通过 sidecar 的受限 Git RPC 识别当前 session cwd 所属仓库，并展示分支、upstream、ahead/behind、暂存、未暂存、未跟踪、冲突和仓库操作状态。

#### Scenario: 打开普通 Git 仓库
- **WHEN** 用户选择的项目目录位于有效 Git worktree 内
- **THEN** 系统返回规范化仓库根、当前分支和按状态分组的文件，不依赖本地化的人类可读 Git 输出

#### Scenario: 当前目录不是 Git 仓库
- **WHEN** sidecar 无法从当前 session cwd 解析 Git worktree
- **THEN** 源代码管理视图显示非仓库状态且不影响 Agent 对话、项目切换和应用内终端

### Requirement: Desktop 按审查范围展示准确 Diff
系统 SHALL 支持工作区、暂存区和分支比较 Diff，并对重命名、删除、中文路径、二进制文件、超大文件和截断内容给出明确状态。

#### Scenario: 查看暂存区 Diff
- **WHEN** 用户选择“已暂存的更改”中的文件
- **THEN** 系统展示相对于 HEAD 的 cached Diff、正确的新旧行号和文件状态

#### Scenario: Diff 超出限制
- **WHEN** 单文件或总 Diff 超过配置的安全上限
- **THEN** 系统返回已截断标记、未审查范围和文件摘要，而不是静默丢弃内容或阻塞整个工作台

### Requirement: 暂存与取消暂存只能作用于明确路径
系统 SHALL 只对用户选择的仓库内路径执行暂存或取消暂存，并在操作完成后返回新的仓库版本和反向动作。

#### Scenario: 暂存选中文件
- **WHEN** 用户选择一个或多个未暂存路径并执行暂存
- **THEN** sidecar 以路径白名单执行 Git 操作，文件移动到已暂存分组且其他路径不受影响

#### Scenario: 路径逃逸仓库
- **WHEN** 请求路径规范化后不属于当前仓库或包含无法解析的仓库外目标
- **THEN** sidecar 拒绝整个操作并返回可审计错误，不执行部分暂存

### Requirement: 提交操作展示精确范围并遵守本地 Git 策略
系统 SHALL 在提交前展示待提交文件和消息，要求用户确认，并让系统 Git 正常执行 hooks、签名和用户配置。

#### Scenario: 提交已暂存变更
- **WHEN** 用户填写非空提交消息、确认文件范围并执行提交
- **THEN** 系统只提交 index 中的内容，返回 commit SHA 和刷新后的仓库状态

#### Scenario: Hook 或签名失败
- **WHEN** Git hook、签名或用户配置拒绝提交
- **THEN** 系统保留已暂存内容，展示 Git 的结构化失败摘要，并且不通过跳过 hook 或关闭签名重试

### Requirement: 分支和远程同步只开放 v1 安全子集
系统 SHALL 支持创建/切换分支、Fetch、仅快进 Pull 和普通 Push，并禁止强推、硬重置、清理、Rebase 和自动冲突解决。

#### Scenario: 切换分支会覆盖本地变更
- **WHEN** Git 判断目标分支切换会覆盖未提交变更
- **THEN** 系统停止切换并展示阻断原因，不自动 stash、reset 或丢弃文件

#### Scenario: Pull 不是快进
- **WHEN** upstream 与本地分支已经分叉且无法 fast-forward
- **THEN** `git_pull_ff_only` 失败并提示用户在终端或 Agent 辅助下选择合并策略

#### Scenario: 用户尝试强推
- **WHEN** UI 或异常客户端构造包含 force 语义的 Push 请求
- **THEN** sidecar 命令策略拒绝请求且不启动 Git 进程

### Requirement: 同一仓库的变更操作必须串行
系统 SHALL 为每个仓库维持写操作互斥锁，并为操作提供唯一 ID、进度、完成、失败和取消状态。

#### Scenario: 写操作正在运行
- **WHEN** 当前仓库已有提交、切分支或远程同步操作未结束且用户发起第二个写操作
- **THEN** 系统排队或明确拒绝第二个操作，不并发修改 index、HEAD 或 refs

#### Scenario: 操作完成后刷新
- **WHEN** 任一 Git 写操作成功、失败或取消
- **THEN** 系统重新读取仓库状态并用新的 repositoryVersion 替换过期 UI 数据

