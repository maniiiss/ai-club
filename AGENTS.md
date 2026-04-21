# AI Club 智能体工作入口

## 基本约束

- 所有源码、脚本、文档必须使用 UTF-8 无 BOM 保存。
- 中文必须直接写入文件，不允许写成 `\uXXXX` 转义。
- 新增或修改类、接口方法、实体字段、复杂流程时，需要补充中文注释说明业务意图。
- 修改前先阅读关联模块和现有测试，避免只按文件名猜测职责。
- 不要回滚、覆盖或格式化与当前任务无关的改动。

## 项目地图

- `frontend/`：Vue 3 + Vite + Element Plus 控制台。
- `backend/`：Spring Boot 业务后端，数据库迁移由 Flyway 管理。
- `code-processing/`：FastAPI 代码处理服务，负责代码扫描、MR 审查和 MCP 工具服务。
- `scripts/`：本地启动、停止、打包、校验脚本。
- `docs/`：架构、模块设计和智能体协作规范。
- `.run-logs/`：本地源码模式运行日志，排查启动和集成问题优先查看这里。

## 常用命令

- 编码检查：`python scripts/check_encoding.py`
- 后端测试：`cd backend && mvn -s maven-settings-central.xml test`
- 前端构建：`cd frontend && npm run build`
- 代码处理服务安装：`cd code-processing && pip install -e .`
- Windows 源码模式启动：`powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`
- Windows 源码模式停止：`powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1`
- Linux 源码模式启动：`bash ./scripts/start-linux.sh`
- Linux 源码模式停止：`bash ./scripts/stop-linux.sh`

## Harness 优先级

- 接到任务后先判断影响范围，再选择最小可验证 harness。
- 文档、脚本、配置变更至少运行编码检查。
- 后端业务变更优先运行相关 JUnit 测试，再视影响范围运行 Maven 全量测试。
- 前端类型或页面变更优先运行 `npm run build`。
- 跨服务改动需要至少验证对应服务能启动，必要时使用源码模式脚本串起 `backend`、`frontend`、`code-processing`。
- 详细规范见 `docs/harness-best-practices.md`。

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **git-ai-club** (6256 symbols, 22298 relationships, 300 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
