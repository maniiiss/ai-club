# AI Club 智能体工作入口

## 基本约束

- 所有源码、脚本、文档必须使用 UTF-8 无 BOM 保存。
- 中文必须直接写入文件，不允许写成 `\uXXXX` 转义。
- 新增或修改类、接口方法、实体字段、复杂流程时，需要补充中文注释说明业务意图。
- 修改前先阅读关联模块和现有测试，避免只按文件名猜测职责。
- 不要回滚、覆盖或格式化与当前任务无关的改动。
- 完成技术架构调整、跨模块边界变化或大型技术设计后，必须同步更新 `docs/architecture.md` 或新增专题设计文档，不能只把结论留在聊天记录里。

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
- 涉及技术架构调整、大型技术设计或重要模块边界变化时，交付物必须包含文档更新，优先补充 `docs/architecture.md` 或新增 `docs/*-architecture-vN.md` / `docs/*-technical-design-vN.md`。
- 详细规范见 `docs/harness-best-practices.md`。

## 移动端样式设计

- 移动端样式设计方案见 `docs/mobile-console-technical-design-v1.md`。
- 后续新增移动端模块或继续改造首页、项目管理、执行中心、迭代管理与各类管理列表时，优先按这份方案复用布局、分页和交互规则，而不是重新各做一套。

## GitNexus 路由

- 代码理解、影响分析、调试和重构优先使用 GitNexus；索引过期时先运行 `npx gitnexus analyze`。
- 修改函数、类、方法等符号前，先做 upstream impact；遇到 HIGH / CRITICAL 风险先向用户说明。
- GitNexus 详细流程不要写在本入口文件，按任务阅读 `.claude/skills/gitnexus/` 下对应技能文档。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ai-club** (12602 symbols, 46352 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/ai-club/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ai-club/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ai-club/clusters` | All functional areas |
| `gitnexus://repo/ai-club/processes` | All execution flows |
| `gitnexus://repo/ai-club/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
