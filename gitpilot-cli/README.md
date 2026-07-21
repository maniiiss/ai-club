# GitPilot CLI

GitPilot CLI 是运行在用户本地仓库中的 Pi Coding Agent。首版通过 AI Club 平台设备授权登录，并通过短期 model session 调用平台已配置的 CHAT 模型。

## 开发运行

```powershell
cd gitpilot-cli
npm install
npm run build
npm link
gitpilot login
gitpilot models
gitpilot exec -p "读取当前 Git 状态并说明下一步建议"
gitpilot
```

首次使用必须先注册平台地址，地址会写入 `~/.gitpilot/config.toml`，不需要设置环境变量：

```powershell
gitpilot register https://gitpilot.example.com
```

## 凭据与安全边界

- CLI Token 使用操作系统凭据库保存，当前实现使用 `@napi-rs/keyring` 对接 Windows Credential Manager、macOS Keychain 和 Linux Secret Service。
- 模型 API Key、平台真实模型地址和 model session 不写入 CLI 文件、日志或本地会话快照。
- 本地文件和 Shell 工具仅允许访问当前工作目录；文件写入和命令执行需要终端确认，固定危险命令会被拒绝。
- `~/.gitpilot/sessions/` 只保存脱敏后的用户/助手文本历史，不保存工具原始结果和任何 Token。

## 命令

- `gitpilot login/logout/status`：设备授权登录、退出和查看登录态。
- `gitpilot register [平台地址]`：注册或修改当前 CLI 使用的平台地址；`registe` 仍作为兼容别名保留。
- `gitpilot models`：列出平台启用的 CHAT 模型。
- `gitpilot --model <id>`：使用指定平台模型启动交互式 Pi。
- `gitpilot exec -p "指令"`：执行单轮本地 Coding Agent 任务。

`gitpilot auth login/status/logout` 是兼容别名。项目关联、Git 快照、handoff 和 Cloud Coding 将在后续版本接入。
