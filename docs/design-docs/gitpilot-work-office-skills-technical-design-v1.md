# GitPilot Work Office Skills 技术设计 v1

## 目标与范围

GitPilot Desktop 的 Work 模式新增三个内置 Skill：`office-docx`、`office-xlsx`、`office-pptx`。它们让智能体根据已确认的材料生成和检查真实、可继续编辑的 `.docx`、`.xlsx`、`.pptx` 文件，并在既有 Skill 管理页作为“内置”来源出现。

本期采用 WorkBuddy 风格的本地文件交付路径：智能体在当前 Work 任务工作区内生成 Office 文件，用户随后使用本机 Microsoft Office 或 WPS 继续编辑。它不实现浏览器内的 ONLYOFFICE/Collabora 编辑器，也不自动化控制用户本机 Office/WPS。

## 职责划分

| 层级 | 职责 |
| --- | --- |
| `office-*` Skill | 约束材料核验、文档结构、版本策略、生成后检查与交付说明。 |
| `office_create_document` | 调用 `docx`、`exceljs`、`pptxgenjs` 生成真实 OOXML 二进制文件。 |
| `office_inspect_document` | 复用本地 `document-parser` 提取文本，确认文档可读且关键文本存在。 |
| Desktop Skill 管理 | 显示来源、启停和 CODE/WORK/DESIGN 分配；用户选择优先于产品默认值。 |
| 外部 Office/WPS | 负责复杂排版、动画、图表精修、审阅和最终签发。 |

Skill 不直接写伪装后的文本文件，也不获得 Shell、网络或任务目录以外的文件访问权限。

## 内置安装与模式

内置资源维护于 `gitpilot-cli/src/bundled-skills/`，构建时复制到 Node `dist/bundled-skills/`，Bun sidecar 则随 Desktop resources 分发。首次创建 Agent 服务时，`installBundledSkills()` 将不存在的内置目录复制到 `~/.gitpilot/agent/skills/`，并在 `bundled-skills.json` 登记路径、`SKILL.md` SHA-256 和默认模式。

Office 三件套默认仅分配 `WORK`；`cross-agent-harness` 仍默认 `CODE`。若用户已经在 `skill-scopes.json` 保存了启停或模式配置，则该配置优先，升级不会覆盖个人设置。已有同名目录只有与发布包内容一致时才登记为内置来源，内容不同的目录保留为个人 Skill。

## 受控工具与安全边界

Office 工具只在 Work Agent 注册，且只能解析 `~/.gitpilot/agent/workspaces/<taskId>` 内的相对路径：

- 拒绝空路径、绝对路径、父级路径逃逸和 `.session/` 会话内部目录；
- 输出格式必须与 `.docx`、`.xlsx`、`.pptx` 后缀严格一致；
- 默认拒绝覆盖已有文件；`overwrite: true` 时必须经 Desktop 二次确认；
- 创建后返回文件大小与相对路径，检查工具只输出受限文本抽取结果；Work 文件列表识别 Office MIME 类型，不把二进制内容读入文本编辑器；
- 工具没有 Bash、任意进程启动和外部网络能力。

这使 Work Agent 可以产出可编辑文件，同时不扩大原有任务工作区与会话隔离边界。

## 当前文档能力

- Word：标题、章节、段落、基础表格。
- Excel：多工作表、文本/数字/布尔单元格、公式、首行加粗、冻结首行、基础列宽。
- PowerPoint：宽屏版式、标题、要点、页码。

每一种格式都要求生成后调用检查工具。无法从用户材料证实的数字、日期、责任人和结论需标为待确认，不能补造为事实。重大改版默认以 `-v2` 等新文件名输出，只有用户明确同意才允许覆盖。

## 非目标与后续

本期不支持读取并结构化修改任意既有复杂 Office 文档，不支持主题母版、复杂图表、动画、修订痕迹、Office/WPS COM 自动化或多人协作在线编辑。下一阶段可在 Tauri 增加“使用系统默认应用打开当前成果”的受控命令；如确有多人实时编辑需求，再评估独立部署 ONLYOFFICE/Collabora 及其鉴权、文件存储、版本和审计模型。
