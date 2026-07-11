"""opencode CLI 路径发现与命令前缀构造，供统一 CLI Runner 复用。

opencode（github.com/sst/opencode，仓库已迁移至 anomalyco/opencode）是一个终端 AI 编码代理，
通过 `opencode run` 子命令非交互执行。本模块只负责定位二进制与拼装命令前缀，
具体 prompt、mode 与输出收集由 ``cli_execution_service`` 统一编排。
"""
import os
import shutil
from pathlib import Path

from app.settings import settings


def discover_opencode_cli_path() -> Path:
    """按配置 -> which -> Windows npm/安装目录兜底顺序定位 opencode 二进制。

    优先级：
    1. ``settings.opencode_cli_path``（``PLATFORM_OPENCODE_CLI_PATH``）
    2. ``shutil.which("opencode")``（PATH 可见时）
    3. Windows 下 npm 全局目录与 opencode 安装目录兜底

    都找不到时抛 ``RuntimeError``，由调用方回传错误，不影响其他 runner。
    """
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
    # npm 全局安装会产生 .cmd/.ps1 包装脚本；原生安装脚本可能落到 LOCALAPPDATA。
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
    """构造 opencode 非交互命令前缀。

    opencode 通过 ``run`` 子命令发一条 prompt 后流式输出并退出，无需额外交互禁用参数。
    Windows 下若命中 ``.ps1`` 包装脚本，须经 powershell 间接启动，避免脚本路径解析问题。
    """
    suffix = opencode_cli.suffix.lower()
    if suffix == ".ps1":
        return ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(opencode_cli), "run"]
    return [str(opencode_cli), "run"]
