import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from app.settings import settings

_SERVE_LOCK = threading.Lock()
_SERVE_PROCESS: subprocess.Popen | None = None


def ensure_gitnexus_serve_running(gitnexus_cli: Path) -> bool:
    """按需启动并复用 GitNexus serve。"""
    with _SERVE_LOCK:
        if _is_serve_reachable():
            return True
        _stop_stale_process_if_needed()
        _start_gitnexus_serve(gitnexus_cli)
        deadline = time.time() + 15
        while time.time() < deadline:
            if _is_serve_reachable():
                return True
            if _SERVE_PROCESS is not None and _SERVE_PROCESS.poll() is not None:
                break
            time.sleep(0.3)
        raise RuntimeError(f"GitNexus serve 未能在端口 {settings.gitnexus_serve_port} 上就绪")


def probe_gitnexus_serve(base_url: str) -> bool:
    """serve 没有 `/health`，这里只要能建立 HTTP 连接并返回任意响应就算存活。"""
    try:
        with urllib.request.urlopen(base_url, timeout=2) as response:
            return response.status >= 100
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


def local_gitnexus_serve_base_url() -> str:
    """返回 code-processing 本机用于探活的 GitNexus serve 地址。"""
    host = (settings.gitnexus_serve_host or "").strip() or "127.0.0.1"
    if host == "0.0.0.0":
        # 当前 GitNexus serve 会监听 IPv4 loopback；Windows 上 localhost 可能优先解析到 ::1 后超时。
        # 探活固定走 127.0.0.1，避免进程已启动却被误判为“端口未就绪”。
        host = "127.0.0.1"
    if not host.startswith("http://") and not host.startswith("https://"):
        host = f"http://{host}"
    return f"{host}:{settings.gitnexus_serve_port}"


def _is_serve_reachable() -> bool:
    return probe_gitnexus_serve(local_gitnexus_serve_base_url())


def _stop_stale_process_if_needed() -> None:
    global _SERVE_PROCESS
    if _SERVE_PROCESS is None:
        return
    if _SERVE_PROCESS.poll() is None:
        try:
            _SERVE_PROCESS.terminate()
            _SERVE_PROCESS.wait(timeout=2)
        except Exception:
            _SERVE_PROCESS.kill()
    _SERVE_PROCESS = None


def _start_gitnexus_serve(gitnexus_cli: Path) -> None:
    global _SERVE_PROCESS
    command = [
        str(gitnexus_cli),
        "serve",
        "--port",
        str(settings.gitnexus_serve_port),
    ]
    startupinfo = None
    creationflags = 0
    if hasattr(subprocess, "STARTUPINFO"):
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        creationflags = subprocess.CREATE_NO_WINDOW
    _SERVE_PROCESS = subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        startupinfo=startupinfo,
        creationflags=creationflags,
    )


def _reset_gitnexus_serve_state_for_tests() -> None:
    """测试辅助：清理全局 serve 进程状态。"""
    global _SERVE_PROCESS
    _SERVE_PROCESS = None
