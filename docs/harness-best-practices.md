# AI Club Harness 最佳实践

## 背景

本文根据 OpenAI 官方文章《Harness engineering for context engineering》整理，并结合本仓库的 `frontend`、`backend`、`code-processing`、`scripts`、`docs` 多模块结构，定义适合 AI Club 项目的 harness 最佳实践。

这里的 harness 不是单一测试框架，而是一组帮助人和智能体稳定工作的工程脚手架：项目入口说明、模块文档、可复现命令、验证脚本、日志路径、回归样例、失败诊断和清理策略。目标是让每次修改都能被快速定位、快速运行、快速验证、快速恢复。

## 来自文章的核心原则

- 把 `AGENTS.md` 当成仓库入口目录，而不是百科全书。入口文件只告诉智能体去哪里看、先跑什么、有哪些硬约束。
- 把 `docs/` 当成持久记忆。重要决策、模块边界、运行方式、故障排查和评测数据都要沉淀到文档，避免上下文只留在聊天记录里。
- 让 harness 像测试套件一样可执行。好 harness 应该包含命令、夹具、样例输入、预期输出和失败判断标准。
- 优先做小而快的验证闭环。智能体需要频繁得到反馈，越早发现方向错了，整体成本越低。
- 保持上下文可恢复。长任务要把关键背景写进文件，让后续智能体或开发者能接着做，而不是重新考古。
- harness 也需要维护。过期文档、失效脚本、错误样例会误导智能体，应该像业务代码一样纳入审查。

## 本项目的 Harness 分层

### 1. 入口层：AGENTS.md

仓库根目录的 `AGENTS.md` 只维护高频信息：

- 编码、中文注释、禁止覆盖无关改动等硬约束。
- `frontend`、`backend`、`code-processing`、`scripts`、`docs` 的职责地图。
- 最常用的启动、测试、构建、编码检查命令。
- 不同改动类型对应的最小验证策略。

不要把详细设计、长故障单、接口清单全部塞进 `AGENTS.md`。当内容超过入口说明范围时，应沉淀到 `docs/`，再从 `AGENTS.md` 链接过去。

### 2. 记忆层：docs/

`docs/` 是项目长期记忆，当前目录职责建议按下面理解：

- `docs/architecture.md`：系统级架构总览、模块边界、跨服务调用链路，是全局视角的主入口。
- `docs/design-docs/index.md`：正式设计文档导航页，用来串起架构设计、技术设计和专题方案入口。
- `docs/generated/`：已经成型的正式技术设计 / 架构设计交付物，适合沉淀 `*-technical-design-vN.md`、`*-architecture-vN.md`。
- `docs/exec-plans/active/`：进行中的执行方案、阶段计划和落地编排，属于过程文档，不替代正式设计结论。
- `docs/exec-plans/completed/`：历史执行方案归档，用于复盘和追溯，不替代当前有效架构说明。
- `docs/design-docs/design-draft/`：设计草稿、界面草图、探索性方案素材，默认不作为正式架构结论交付。
- `docs/encoding-guide.md`、`docs/harness-best-practices.md` 等：工程规范类文档，负责约束协作方式和基础规则。

新增复杂能力时，应同步补充对应文档，尤其是：

- 新增跨服务链路，例如 Hermes 调后端、后端调 code-processing。
- 新增数据库迁移、调度任务、权限策略、后台任务。
- 新增智能体工具、MCP 工具、自动化执行链路。
- 修改启动方式、端口、环境变量或日志位置。

### 2.1 架构调整与大型技术设计必须落文档

这条规则是本仓库的硬约束：只要改动达到“技术架构调整”或“大型技术设计”级别，任务完成前就必须把结论沉淀到 `docs/`，未补文档视为任务未完成。

这里的“沉淀到 `docs/`”不是泛指随便写一份说明，而是要写到**能长期作为后续实现入口的正式文档位置**。执行计划、设计草稿、聊天结论只能作为辅助材料，不能替代正式设计交付。

建议按下表判断是否触发：

| 场景 | 是否必须落文档 | 合格交付位置 |
| --- | --- | --- |
| 服务拓扑、模块边界、职责归属发生变化 | 是 | `docs/architecture.md` + 1 份正式专题设计文档 |
| 新增跨服务链路、异步任务、调度流程、权限模型或共享数据模型 | 是 | `docs/generated/*.md` 或 `docs/*-technical-design-vN.md`，必要时同步更新 `docs/architecture.md` |
| 引入新中间件、新运行模式、新部署方式、新环境变量或新日志路径 | 是 | 正式专题设计文档 + `README.md` + `AGENTS.md` |
| 影响 `frontend` / `backend` / `code-processing` / `scripts` 中两个及以上目录的方案设计 | 是 | 正式专题设计文档，必要时补一份执行方案到 `docs/exec-plans/active/` |
| 只改局部实现细节，不改变边界、链路和约束 | 否 | 只在代码注释或模块文档中补充说明即可 |

“正式专题设计文档”建议优先放在以下位置之一：

- `docs/generated/*-technical-design-vN.md`
- `docs/generated/*-architecture-vN.md`
- `docs/` 根目录下已有同类正式设计文件

以下内容**不能单独作为完成条件**：

- `docs/exec-plans/active/` 中的进行中计划，因为它描述的是实施编排，不一定沉淀最终边界结论。
- `docs/exec-plans/completed/` 中的历史归档，因为它主要用于复盘，可能已经过时。
- `docs/design-docs/design-draft/` 中的草稿、原型和截图，因为它们默认属于探索材料，不是正式架构基线。
- 聊天记录、PR 描述、提交说明，因为这些内容不具备稳定可检索的仓库内入口。

最低交付要求如下：

- 全局架构变化：至少更新 `docs/architecture.md`，说明新的边界、链路、依赖关系和受影响模块。
- 专题方案设计：新增或更新 1 份正式设计文档，推荐从 `docs/architecture-design-template.md` 开始，文件名遵循 `*-technical-design-vN.md` 或 `*-architecture-vN.md`。
- 文档导航同步：如果新增的是正式设计文档，原则上同步更新 `docs/design-docs/index.md`，确保后续入口可发现。
- 执行计划分离：需要分阶段落地时，可额外在 `docs/exec-plans/active/` 维护执行方案，但它不能替代正式设计文档。
- 启动、环境、harness、日志路径变化：同一次交付内同步更新 `README.md`、`AGENTS.md` 和相关专题文档。
- 最终验证：至少运行一次 `docs` 级别 harness，确认文档编码、命令和链接没有明显问题。

### 3. 执行层：scripts/

`scripts/` 是本项目最重要的可执行 harness：

- `scripts/start.ps1` / `scripts/start-linux.sh`：源码模式启动。
- `scripts/stop-windows.ps1` / `scripts/stop-linux.sh`：源码模式停止。
- `scripts/restart-source.ps1` / `scripts/restart-source-linux.sh`：只重启源码服务。
- `scripts/start-docker.ps1` / `scripts/start-docker-linux.sh`：全量 Docker 启动。
- `scripts/package.ps1` / `scripts/package-linux.sh`：全量 Docker 打包。
- `scripts/check_encoding.py`：编码与疑似乱码检查。
- `scripts/harness.ps1` / `scripts/harness-linux.sh`：推荐的统一验证入口。

脚本要满足三个要求：

- 可重复运行：重复执行不应破坏本地环境。
- 输出可诊断：失败时输出具体命令、模块和日志路径。
- 安全写入：PowerShell 写文件必须显式 UTF-8 无 BOM。

### 4. 反馈层：测试、构建与日志

当前项目可用的反馈来源：

- 后端：`cd backend && mvn -s maven-settings-central.xml test`
- 前端：`cd frontend && npm run build`
- 公众端前端：`cd frontend-public && npm run build`
- Python 服务：`cd code-processing && pip install -e .`
- 编码：`python scripts/check_encoding.py`
- 运行日志：`.run-logs/`

建议每次修改都明确选择“最小验证集”和“扩展验证集”。最小验证用于快速反馈，扩展验证用于合并前兜底。

## 推荐验证矩阵

| 改动范围 | 最小验证 | 扩展验证 |
| --- | --- | --- |
| 纯文档 | `python scripts/check_encoding.py` | 人工检查链接、标题、命令是否可执行 |
| 脚本 | `python scripts/check_encoding.py`，执行脚本帮助或 dry-run 路径 | 在 Windows 与 Linux 入口各跑一次等价命令 |
| 架构调整 / 大型技术设计 | `powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target docs` 或 `bash ./scripts/harness-linux.sh docs` | 按影响范围补充对应模块测试或源码模式联调 |
| 后端 DTO / Service / Controller | 相关 JUnit 测试 | `cd backend && mvn -s maven-settings-central.xml test` |
| Flyway 迁移 | 后端测试，必要时重建本地库 | 源码模式启动后检查后端日志和页面 |
| 前端页面 / 类型 | `cd frontend && npm run build` | 源码模式启动后人工走一遍页面 |
| 公众端页面 / 类型 | `cd frontend-public && npm run build` | 源码模式启动后人工走一遍公众端主流程 |
| code-processing | `cd code-processing && pip install -e .` | 启动 FastAPI 并访问 `/docs` |
| 跨服务链路 | 相关单测 + 对应模块构建 | `scripts/start.ps1` 或 `scripts/start-linux.sh` 源码模式联调 |
| 智能体工具 / MCP 工具 | 工具 schema 或服务测试 | 通过 Hermes 或 MCP 客户端跑真实调用样例 |

## 统一 Harness 命令

优先使用统一入口，让智能体和开发者形成一致习惯：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target docs
powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target backend
powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target frontend
powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target all
```

```bash
bash ./scripts/harness-linux.sh docs
bash ./scripts/harness-linux.sh backend
bash ./scripts/harness-linux.sh frontend
bash ./scripts/harness-linux.sh all
```

目标含义：

- `docs`：对 `AGENTS.md`、`README.md`、`docs/`、`scripts/` 运行编码检查，适合文档和脚本小改。
- `backend`：对 `backend/` 运行编码检查，再执行后端测试。
- `frontend`：对 `frontend/` 运行编码检查，再执行前端构建。
- `code-processing`：对 `code-processing/` 运行编码检查，再执行 Python 包安装检查。
- `all`：对整个仓库运行编码检查、后端测试、前端构建、code-processing 安装检查。

## 智能体工作流

### 任务开始

1. 阅读 `AGENTS.md` 获取硬约束和模块地图。
2. 用 `git status --short` 判断工作区是否已有别人改动。
3. 用 `rg` 查找相关类、接口、路由、测试和文档。
4. 选择最小验证 harness，并在动手前确认不会覆盖无关文件。

### 修改中

1. 先改最接近问题的模块，不要顺手大范围重构。
2. 新增复杂逻辑时写中文注释，说明业务意图和边界条件。
3. 新增实体字段、DTO 字段、接口方法时写中文注释，方便后续智能体理解数据语义。
4. 跨服务字段变更必须同步更新前端类型、后端 DTO、数据库迁移和文档。
5. 不要把真实密钥、用户 Token、内网地址写进文档或测试夹具。

### 修改后

1. 如果本次任务涉及架构调整或大型技术设计，先更新 `docs/architecture.md` 或新增专题设计文档，再运行 harness。
2. 运行选定 harness。
3. 如果失败，先看命令输出，再看 `.run-logs/`。
4. 修复后重新运行同一 harness，确认不是偶发通过。
5. 在最终说明里列出改动、验证命令、文档路径和未验证风险。

## Harness 文档模板

新增重要模块或专题设计时，建议优先在正式设计文档位置新增对应文档，并包含以下章节。也可以直接复制 `docs/architecture-design-template.md` 作为起点；如果文档已经定稿，记得同步补到 `docs/design-docs/index.md`：

```markdown
# 模块名称

## 目标

说明模块解决什么问题，不解决什么问题。

## 关键路径

- 入口页面、接口、服务、实体、迁移脚本。
- 上游输入和下游输出。

## 本地运行

列出最小启动命令、依赖服务、默认端口和日志路径。

## 验证方式

列出单测、构建、集成验证、人工验证步骤。

## 常见失败

列出错误现象、排查路径和修复建议。
```

## 回归样例管理

建议把高价值样例分成三类：

- 单元级样例：放在 `backend/src/test` 或未来的 Python 测试目录。
- 接口级样例：放在模块文档中，描述请求参数、权限、预期响应。
- 端到端样例：放在 `docs/` 中，描述用户从页面到后端再到外部系统的完整链路。

每个样例都应包含：

- 初始数据或前置条件。
- 执行动作。
- 预期结果。
- 失败时优先检查的日志或表。

## 日志与故障排查

源码模式启动后优先查看 `.run-logs/`：

- 管理端启动失败：查看 `frontend` 日志和 `frontend/package.json`。
- 公众端启动失败：查看 `frontend-public` 日志和 `frontend-public/package.json`。
- 后端启动失败：查看后端日志、`.env`、PostgreSQL 端口和 Flyway 迁移。
- code-processing 启动失败：查看 Python 依赖、虚拟环境和端口占用。
- Hermes / Hindsight 调用失败：检查 Docker 容器状态、内部地址、后端内部认证配置。

排障记录如果超过一次性说明，应沉淀到模块文档的“常见失败”章节。

## 清理策略

- 不要提交 `.run-logs/`、`target/`、`dist/`、`node_modules/`、`.venv/`、`__pycache__/`。
- 不要把 `.env`、`.env.server` 中的真实值写入文档。
- 不要提交本地上传文件或测试生成的大文件，除非它们是明确的测试夹具。
- 清理缓存前先确认不是用户正在使用的运行态，尤其是 `.data/` 和数据库卷。

## 维护规则

- 当脚本入口变化时，同步更新 `README.md`、`AGENTS.md` 和本文。
- 当模块边界变化时，同步更新 `docs/architecture.md`，并视影响范围更新对应正式设计文档。
- 当完成技术架构调整或大型技术设计时，同步创建或更新正式专题设计文档；仅更新 `exec-plans` 或 `design-draft` 不算任务完成。
- 当新增正式设计文档时，同步更新 `docs/design-docs/index.md`，避免文档存在但没有入口。
- 当新增测试或验证命令时，同步更新推荐验证矩阵。
- 当发现文档错误时，优先修正文档，而不是让后续智能体靠聊天上下文记住例外。

## 与 OpenAI 文章的对应关系

- `AGENTS.md` 对应文章中的目录式入口，让智能体快速找到上下文。
- `docs/` 对应文章中的记录系统，把长期上下文从聊天迁移到仓库。
- `scripts/harness.*` 对应可执行 harness，把最佳实践变成可运行反馈。
- 验证矩阵对应快速反馈闭环，让智能体在小步修改后尽早知道是否偏离。
- 清理策略和维护规则对应 harness 的长期健康，避免过期上下文污染后续任务。

参考来源：[OpenAI《Harness engineering for context engineering》](https://openai.com/zh-Hans-CN/index/harness-engineering/)。
