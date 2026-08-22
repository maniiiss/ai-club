# Code 项目文件树技术设计 v1

## 1. 目标与范围

Code 模式右侧工具窗口增加“文件”页签，用于查看当前 Code 工作目录的轻量文件树，并把用户选择的文件作为对话附件加入输入框。

v1 只提供文件树和文件引用操作，不打开文件、不展示代码内容，也不在 Desktop 侧直接读取本地文件。

## 2. 交互约定

- 右侧 `+` 菜单打开“文件”页签；页签可切换、关闭和再次打开。
- 文件夹点击展开或收起；文件点击只改变选择状态，不触发预览。
- 支持文件名/相对路径搜索，搜索结果保留祖先目录。
- 支持单选、多选、快捷添加到对话框、复制相对路径。
- 文件树中的文件可拖拽到 Code 输入框；跨项目或跨任务拖入会被拒绝。
- 输入框收到文件后继续复用 `prepare_attachments`，发送时沿用现有附件协议。

## 3. 数据与边界

```text
Code runtimeHost.cwd
        │ code_file_list（只返回 path/name/kind/size/updatedAt）
        ▼
Desktop project-files store
        │ 文件路径请求队列（sessionPath + workspacePath 隔离）
        ▼
InputBox ── prepare_attachments ──► PreparedAttachment
```

- CLI 扫描当前 `runtimeHost.cwd`，默认忽略 `.git`、`.gitpilot`、`node_modules`、构建产物、虚拟环境和 Python 缓存目录；同时遵循工作区各级 `.gitignore`（支持注释、取反、目录后缀、锚定、`*`/`?`/`**` 与字符类），避免被 gitignore 覆盖的运行时工件（如 `.scan-workspace`）挤占条目上限导致文件树"显示不全"。固定忽略名单不参与 gitignore 取反。
- 扫描跳过符号链接，限制最大深度 16、最大条目 20,000；超过限制通过 `truncated` 提示 Desktop，文件树页签与 @ 提及面板均展示截断说明。
- RPC 只传元数据。文件内容只在用户明确添加后由 sidecar 的既有附件预处理链路读取。
- Desktop 以 `sessionPath` 和 `workspacePath` 双重匹配待处理请求，避免切换任务或项目时串入附件。

## 4. 后续演进

后续若增加重命名、删除、文件夹创建等写操作，应新增明确的 RPC 命令、确认交互和权限边界；不能把 v1 的只读文件树请求队列扩展成隐式写文件通道。
