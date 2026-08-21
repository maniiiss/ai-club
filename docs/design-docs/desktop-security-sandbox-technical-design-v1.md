# GitPilot Desktop 双模式沙箱与审批策略技术设计 v1

## 目标与边界

Code 会话默认使用 Windows 原生防护，读取和搜索自动执行，文件修改、Bash、网络命令和工作区外访问由 Desktop 审批。Windows 原生模式是路径、命令、超时和进程树策略层，不承诺为任意子进程提供操作系统级网络隔离。

增强模式使用 WSL2 + Gondolin。WSL2、Linux 发行版或 Gondolin worker 未就绪时，sidecar 返回结构化安装引导并阻断任务，不自动安装，也不降级为无限制本机执行。

## 调用链

```text
Desktop
  -> Tauri RPC bridge
    -> gitpilot-cli rpc-mode
      -> AgentSession.beforeToolCall
        -> SecurityPolicy / ApprovalRequired
          -> WindowsNativeExecutor 或 GondolinExecutor
```

任务创建时复制安全策略。任务执行期间策略不静默改变；切换模式只允许在空闲状态下应用到后续任务。审批授权仅保留在当前 sidecar 会话和当前工作区，不写入会话文件。

## 统一策略

默认值为 `windows-native`、`deny-by-default`、默认 120 秒、最大 600 秒。`read`、`grep`、`find`、`ls` 自动执行；`edit`、`write`、`bash` 需要审批。工作区外读取也需要审批。`find /`、`grep -r /`、`rg /`、驱动器根扫描、敏感系统目录访问和越界路径强制拒绝。

审批事件为 `approval_required`，携带审批 ID、会话 ID、工具、风险、命令、路径、工作目录和 10 分钟过期时间。响应为 `approve_once`、`approve_session` 或 `deny`。abort、sidecar 断开、任务切换和超时都会拒绝并清理 pending 状态。

## 执行器

`WindowsNativeExecutor` 校验当前工作区存在并公布策略防护状态，实际 Bash 由既有本地执行后端执行，超时统一使用 120 秒并限制为 600 秒，Windows 使用 `taskkill /T /F` 清理进程树。

`GondolinExecutor` 负责探测 `wsl.exe --status`、Linux 发行版和 Gondolin worker。正式 worker 通过 WSL2 启动并将宿主工作区映射为 guest `/workspace`；当前构建先完成能力探测和失败阻断边界，worker 未安装时只展示引导状态。

## Desktop 交互

设置页展示当前模式、初始化状态、WSL2/Gondolin 缺失原因、默认网络策略和 timeout。工具执行前显示命令、目录、目标路径和风险等级，用户可以允许一次、本会话允许或拒绝。刷新和重连通过 `get_security_policy` 恢复 pending 审批摘要。

## 明确风险

Windows 原生模式不能阻止恶意或未知子进程绕过 GitPilot 策略自行联网，因此网络命令采用风险识别与审批。需要系统级文件和网络隔离时必须安装并启用 Gondolin 增强模式。

