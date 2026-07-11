# OpenCode CLI Runner 实现计划 v1

> **For agentic workers:** 用 superpowers:executing-plans 逐任务执行。步骤用 checkbox (`- [ ]`) 跟踪。

**Goal:** 将 opencode 作为第三个 CLI Runner（`OPENCODE_CLI`）接入平台运行时智能体，全量对齐 Claude Code CLI 的 mode 覆盖。

**Architecture:** opencode 执行函数内联到 `cli_execution_service.py`（与 codex/claude markdown/implementation 逻辑同处，避免循环导入），CLI 路径发现拆到小模块 `opencode_cli_support.py`（对齐 `gitnexus_cli_support.py`）。后端 `AgentExecutionService` / `PlatformStoreService` 增加白名单，前端表单增加选项。设计依据见 `docs/design-docs/opencode-runtime-technical-design-v1.md`。

**Tech Stack:** Python/FastAPI（code-processing）、Spring Boot（backend）、Vue 3（frontend）

## 结构说明（对设计文档的优化）

设计文档原拟独立 `opencode_execution_service.py`。精读 `cli_execution_service.py` 后发现：codex/claude 的 markdown/implementation 执行逻辑都内聚在 `cli_execution_service.py`，且 `_run_markdown_session` 已按 `runnerType` 分发。独立 service 会与 `cli_execution_service` 互相导入（markdown workspace、technical design context、validation 等共享助手都在该文件）形成循环。故改为内联 + 小 support 模块，更贴合代码库。

opencode mode 映射：PLAN/AD_HOC/技术设计 -> `--agent plan`（只读）；IMPLEMENT -> `--agent build --auto`；TEST -> 复用 codex 测试桥。

## Global Constraints

- 源码 UTF-8 无 BOM，中文直接写入，不写 `\uXXXX`。
- 新增类/方法/复杂流程补中文注释。
- 不回滚/格式化无关改动。
- opencode 命令面：`opencode run "<prompt>" --dir <path> --format default --agent <plan|build> [--auto] [--model provider/model]`。
- 环境变量：`PLATFORM_OPENCODE_CLI_PATH`、`PLATFORM_OPENCODE_MODEL`。

---

### Task 1: code-processing 配置与模型定义

**Files:**
- Modify: `code-processing/app/models.py:749`
- Modify: `code-processing/app/settings.py`

- [ ] Step 1: `models.py` 的 `runnerType` Literal 增加 `"OPENCODE_CLI"`：
```python
runnerType: Literal["CODEX_CLI", "CLAUDE_CODE_CLI", "OPENCODE_CLI", "PATROL_MODEL"]
```

- [ ] Step 2: `settings.py` 的 `Settings` dataclass 增加两字段：
```python
opencode_cli_path: str
opencode_model: str
```

- [ ] Step 3: `settings.py` 构造实例处增加：
```python
opencode_cli_path=(os.getenv("PLATFORM_OPENCODE_CLI_PATH", "") or "").strip(),
opencode_model=(os.getenv("PLATFORM_OPENCODE_MODEL", "") or "").strip(),
```

### Task 2: opencode CLI 路径发现 support 模块

**Files:**
- Create: `code-processing/app/services/opencode_cli_support.py`

镜像 `claude_planning_service._discover_claude_cli_path` 与 `_build_claude_command_prefix`，但 opencode 是 `run` 子命令形态。

- [ ] Step 1: 新建 `opencode_cli_support.py`：
```python
"""opencode CLI 路径发现与命令前缀构造，供统一 CLI Runner 复用。"""
import os
import shutil
from pathlib import Path

from app.settings import settings


def discover_opencode_cli_path() -> Path:
    """按配置 -> which -> Windows npm 兜底顺序定位 opencode 二进制。"""
    configured = (settings.opencode_cli_path or "").strip()
    if configured:
        path = Path(configured).expanduser().resolve()
        if path.exists():
            return path

    which_path = shutil.which("opencode")
    if which_path:
        return Path(which_path).resolve()

    app_data = Path(os.getenv("APPDATA", ""))
    local_app_data = Path(os.getenv("LOCALAPPDATA", ""))
    candidates = [
        app_data / "npm" / "opencode.cmd",
        app_data / "npm" / "opencode.ps1",
        app_data / "npm" / "opencode",
        local_app_data / "opencode" / "opencode.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    raise RuntimeError("未找到 opencode CLI，可通过 PLATFORM_OPENCODE_CLI_PATH 显式配置")


def build_opencode_command_prefix(opencode_cli: Path) -> list[str]:
    """opencode 通过 run 子命令非交互执行；.ps1 包装需经 powershell 启动。"""
    suffix = opencode_cli.suffix.lower()
    if suffix == ".ps1":
        return ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(opencode_cli), "run"]
    return [str(opencode_cli), "run"]
```

### Task 3: cli_execution_service.py 内联 opencode 执行逻辑

**Files:**
- Modify: `code-processing/app/services/cli_execution_service.py`

镜像 claude 的 markdown/implementation 函数，复用 codex_service 的 workspace 助手与现有 markdown 共享助手。

- [ ] Step 1: 顶部 import 增加 opencode_support：
```python
from app.services.opencode_cli_support import (
    build_opencode_command_prefix,
    discover_opencode_cli_path,
)
```

- [ ] Step 2: 分发器 `execute_cli_execution` 增加 OPENCODE_CLI 分支（在 CODEX_CLI 分支后、Claude 默认前）：
```python
    if request.runnerType == "OPENCODE_CLI":
        if request.mode == "IMPLEMENT":
            return _execute_opencode_implementation_sync(request)
        if request.mode == "TEST":
            return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
        return _execute_opencode_markdown_sync(request)
```

- [ ] Step 3: `start_cli_execution` 对称增加 OPENCODE_CLI 分支：
```python
    if request.runnerType == "OPENCODE_CLI":
        if request.mode == "IMPLEMENT":
            return _start_opencode_implementation_session(request)
        if request.mode == "TEST":
            return codex_service.start_codex_execution(_to_codex_request(request))
        return _start_markdown_session(request)
```

- [ ] Step 4: `_run_markdown_session` 的 runnerType 分发增加 OPENCODE_CLI 分支（line ~342）：
```python
        if request.runnerType == "CODEX_CLI":
            output = _run_codex_markdown_cli_streaming(...)
        elif request.runnerType == "OPENCODE_CLI":
            output = _run_opencode_markdown_cli_streaming(
                runtime_request, workspace, repo_paths, batcher, technical_context,
                should_cancel=cancel_watcher.should_cancel,
            )
        else:
            output = _run_claude_markdown_cli_streaming(...)
```

- [ ] Step 5: 增加命令构造器（镜像 `_build_claude_markdown_command`）：
```python
def _build_opencode_markdown_command(request: CliExecutionRequest, opencode_cli: Path, repo_paths: list[Path]) -> list[str]:
    command = [
        *build_opencode_command_prefix(opencode_cli),
        "--format", "default",
        "--agent", "plan",
        "--dir", str(repo_paths[0]) if repo_paths else ".",
    ]
    if settings.opencode_model:
        command.extend(["--model", settings.opencode_model])
    return command
```
注：opencode markdown 步骤统一只读 `--agent plan`，技术设计步骤的只读由 prompt + 章节校验保证。

- [ ] Step 6: 增加 implementation 命令构造器：
```python
def _build_opencode_implementation_command(opencode_cli: Path, repo_dir: Path) -> list[str]:
    command = [
        *build_opencode_command_prefix(opencode_cli),
        "--format", "default",
        "--agent", "build",
        "--auto",
        "--dir", str(repo_dir),
    ]
    if settings.opencode_model:
        command.extend(["--model", settings.opencode_model])
    return command
```

- [ ] Step 7: 增加 markdown 同步执行 + CLI 运行函数（镜像 `_execute_claude_markdown_sync` / `_run_claude_markdown_cli` / streaming）。prompt 经 stdin 传入（与 claude 一致，避免 Windows 包装层丢多行参数）：
```python
def _execute_opencode_markdown_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    workspace = _markdown_workspace_for(request)
    _recreate_markdown_workspace(workspace)
    repo_paths = _prepare_markdown_repositories(request, workspace)
    technical_context = _collect_technical_design_context(request, workspace, repo_paths)
    output = _run_opencode_markdown_cli(request, workspace, repo_paths, technical_context)
    _validate_technical_design_output(request, output)
    return CliExecutionResponse(
        output=output.strip(),
        workspaceRoot=str(workspace.root),
        repoPaths=[str(path) for path in repo_paths],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _run_opencode_markdown_cli(request, workspace, repo_paths, technical_context="") -> str:
    opencode_cli = discover_opencode_cli_path()
    command = _build_opencode_markdown_command(request, opencode_cli, repo_paths)
    prompt = _build_opencode_markdown_prompt(request, repo_paths, technical_context)
    display_command = codex_service._format_process_command_for_log(command)
    _append_markdown_log(workspace, f"调用 opencode CLI：{display_command}")
    completed = subprocess.run(command, cwd=workspace.root, input=prompt,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=request.timeoutSeconds, env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"})
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if stdout: _append_markdown_log(workspace, stdout)
    if stderr: _append_markdown_log(workspace, stderr)
    if completed.returncode != 0:
        raise RuntimeError(stderr or stdout or "opencode 执行失败")
    return stdout
```
同步 streaming 版 `_run_opencode_markdown_cli_streaming` 镜像 `_run_claude_markdown_cli_streaming`，改用 opencode 命令构造器与 command_label="opencode CLI"。

- [ ] Step 8: 增加 markdown prompt 构造器（镜像 `_build_claude_markdown_prompt`，措辞改为 opencode）。

- [ ] Step 9: 增加 implementation 同步执行 + 运行函数（镜像 `_execute_claude_implementation_sync` / `_run_claude_implementation_cli`），复用 `codex_service._workspace_for/_clone_repository/_prepare_local_branch/_collect_changed_files/_current_head_commit/_current_branch/_build_change_review_payload/_normalize_implementation_payload/_implementation_raw_output_from_markdown`。

- [ ] Step 10: 增加 implementation 异步 session（`_start_opencode_implementation_session` / `_run_opencode_implementation_session`），镜像 `_start_claude_implementation_session` / `_run_claude_implementation_session`，session_id 前缀 `opencode-implement`，日志标签 "opencode CLI"。

- [ ] Step 11: 增加 implementation prompt 构造器（镜像 `_build_claude_implementation_prompt`）。

### Task 4: 后端调度与校验

**Files:**
- Modify: `backend/.../service/AgentExecutionService.java`
- Modify: `backend/.../service/PlatformStoreService.java`

- [ ] Step 1: `AgentExecutionService` 增加常量：
```java
public static final String RUNTIME_OPENCODE_CLI = "OPENCODE_CLI";
```

- [ ] Step 2: `executeRuntimeAgent` switch 增加 OPENCODE_CLI 到 CLI 分支：
```java
case RUNTIME_CODEX_CLI, RUNTIME_CLAUDE_CODE_CLI, RUNTIME_OPENCODE_CLI -> executeCliRuntime(agent, input, variables);
```

- [ ] Step 3: `isCliRuntime` 接受集增加 OPENCODE_CLI：
```java
return RUNTIME_CODEX_CLI.equals(normalized) || RUNTIME_CLAUDE_CODE_CLI.equals(normalized) || RUNTIME_OPENCODE_CLI.equals(normalized);
```

- [ ] Step 4: `normalizeRuntimeType` 白名单增加 OPENCODE_CLI，错误信息更新。

- [ ] Step 5: `PlatformStoreService.normalizeConfiguredRuntimeType` 白名单增加 `AgentExecutionService.RUNTIME_OPENCODE_CLI`，错误信息更新。

### Task 5: 前端管理端

**Files:**
- Modify: `frontend/src/views/AgentView.vue`

- [ ] Step 1: `AgentForm.runtimeType` 类型联合增加 `'OPENCODE_CLI'`。

- [ ] Step 2: `runtimeTypeOptions` 增加：
```ts
{ label: 'OpenCode CLI Runner', value: 'OPENCODE_CLI' }
```

- [ ] Step 3: 核对表单 AGENT_RUNTIME 区 gateway 显示条件（仅 OPENCLAW 显示 gateway），CLI Runner 分支无需新校验。

### Task 6: 测试与文档

**Files:**
- Modify: `code-processing/tests/test_cli_execution_service.py`
- Modify: `docs/architecture.md`

- [ ] Step 1: 测试增加 OPENCODE_CLI 命令构造（plan/build+auto/model/dir）与分发路由断言，mock `discover_opencode_cli_path` 与 `subprocess.run`/`run_streaming_process`。

- [ ] Step 2: `docs/architecture.md` 运行时接入小节把 opencode 列为第三个 CLI Runner。

### Task 7: 验证 Harness

- [ ] Step 1: `cd code-processing && python -m pytest tests/test_cli_execution_service.py -v`
- [ ] Step 2: `cd frontend && npm run build`
- [ ] Step 3: `python scripts/check_encoding.py`
- [ ] Step 4: 后端编译 `cd backend && mvn -s maven-settings-central.xml -q compile`（视耗时）

## 自检

- spec 覆盖：设计文档 11 节均映射到任务。✓
- 占位符：无 TBD/TODO，命令构造与分发代码完整。✓
- 类型一致：`discover_opencode_cli_path`/`build_opencode_command_prefix` 在 support 与 service 引用一致。✓
