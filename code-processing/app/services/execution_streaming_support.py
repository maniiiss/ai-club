import json
import mimetypes
import os
import signal
import subprocess
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from queue import Empty, Queue
from time import monotonic, sleep
from typing import Callable

import httpx
from minio import Minio

from app.settings import settings


@dataclass(frozen=True)
class StreamingProcessResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool = False
    canceled: bool = False


class BackendEventBatcher:
    """按时间窗口批量向 backend 回调 runner 事件。"""

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._events: list[dict[str, object]] = []
        self._last_flush = monotonic()
        self._lock = threading.Lock()
        self._heartbeat_stop_event = threading.Event()
        self._heartbeat_thread: threading.Thread | None = None
        self._heartbeat_lock = threading.Lock()

    def emit(
        self,
        event_type: str,
        *,
        stream_kind: str = "",
        text: str = "",
        current_command: str = "",
        progress_percent: int | None = None,
        summary: str = "",
        artifact_id: int | None = None,
    ) -> None:
        should_flush = False
        with self._lock:
            self._events.append(
                {
                    "eventType": event_type,
                    "streamKind": stream_kind,
                    "text": text,
                    "currentCommand": current_command,
                    "progressPercent": progress_percent,
                    "summary": summary,
                    "artifactId": artifact_id,
                }
            )
            should_flush = self._should_flush_locked()
        if should_flush:
            self.flush()

    def flush(self) -> bool:
        with self._lock:
            if not self._events:
                return True
            events = list(self._events)
            self._events = []
            self._last_flush = monotonic()
        posted = _post_backend_json(
            f"/internal/execution-sessions/{self._session_id}/events",
            {"events": events},
            raise_errors=False,
            retry_seconds=12.0,
        )
        if not posted:
            # /start 接口先返回 accepted，backend 随后才绑定 runnerSessionId；
            # 如果事件抢先到达，不能让后台 runner 线程异常退出，否则平台侧只能等到心跳超时。
            with self._lock:
                self._events = events + self._events
            return False
        return True

    def start_heartbeat(
        self,
        *,
        summary: str | Callable[[], str],
        current_command: str = "",
        interval_seconds: float = 10.0,
    ) -> None:
        """启动会话级保活心跳，覆盖 clone、依赖安装等没有 stdout 的长耗时阶段。"""
        with self._heartbeat_lock:
            if self._heartbeat_thread is not None and self._heartbeat_thread.is_alive():
                return
            self._heartbeat_stop_event.clear()

            def _loop() -> None:
                while not self._heartbeat_stop_event.wait(max(interval_seconds, 1.0)):
                    heartbeat_summary = summary() if callable(summary) else summary
                    self.emit(
                        "heartbeat",
                        summary=heartbeat_summary,
                        current_command=current_command,
                    )
                    self.flush()

            self._heartbeat_thread = threading.Thread(
                target=_loop,
                name=f"backend-event-heartbeat-{self._session_id}",
                daemon=True,
            )
            self._heartbeat_thread.start()

    def close(self) -> None:
        """停止后台保活线程并尽量冲刷剩余事件。"""
        self._heartbeat_stop_event.set()
        heartbeat_thread = self._heartbeat_thread
        if heartbeat_thread is not None and heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=1.0)
        self.flush()

    def _should_flush_locked(self) -> bool:
        approx_size = sum(len(json.dumps(item, ensure_ascii=False)) for item in self._events)
        return len(self._events) >= 8 or approx_size >= 4096 or monotonic() - self._last_flush >= 1


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_session_id(step_id: str, prefix: str) -> str:
    safe_step = "".join(char if char.isalnum() else "-" for char in (step_id or "step")).strip("-") or "step"
    return f"{prefix}-{safe_step}-{uuid.uuid4().hex[:12]}"


def complete_session(
    session_id: str,
    *,
    status: str,
    output_snapshot: str = "",
    output_summary: str = "",
    error_message: str = "",
    artifacts: list[dict[str, object]] | None = None,
) -> None:
    payload = {
        "status": status,
        "outputSnapshot": output_snapshot,
        "outputSummary": output_summary,
        "errorMessage": error_message,
        "artifacts": artifacts or [],
    }
    _post_backend_json(
        f"/internal/execution-sessions/{session_id}/complete",
        payload,
        raise_errors=False,
        retry_seconds=30.0,
    )


def run_streaming_process(
    command: list[str] | str,
    *,
    cwd: Path,
    timeout_seconds: int,
    batcher: BackendEventBatcher,
    command_label: str,
    workspace_log_file: Path,
    stdout_file: Path | None = None,
    stderr_file: Path | None = None,
    stdin_text: str | None = None,
    env: dict[str, str] | None = None,
    shell: bool = False,
    should_cancel=None,
    cancel_message: str = "执行任务已取消",
) -> StreamingProcessResult:
    cwd.mkdir(parents=True, exist_ok=True)
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdin=subprocess.PIPE if stdin_text is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=shell,
        env=env or os.environ.copy(),
        bufsize=1,
        creationflags=creationflags,
        start_new_session=os.name != "nt",
    )

    batcher.emit("command_started", current_command=command_label, summary=command_label)
    batcher.flush()

    queue: Queue[tuple[str, str]] = Queue()
    stdout_done = threading.Event()
    stderr_done = threading.Event()
    stdout_collected: list[str] = []
    stderr_collected: list[str] = []
    stdout_buffer: list[str] = []
    stderr_buffer: list[str] = []
    last_flush = monotonic()
    last_heartbeat = monotonic()
    deadline = monotonic() + max(timeout_seconds, 1)
    stdin_error_message = ""

    _start_stream_reader(process.stdout, "stdout", queue, stdout_done, stdout_file, workspace_log_file)
    _start_stream_reader(process.stderr, "stderr", queue, stderr_done, stderr_file, workspace_log_file)
    if stdin_text is not None and process.stdin is not None:
        try:
            process.stdin.write(stdin_text)
            process.stdin.close()
        except (BrokenPipeError, OSError, ValueError) as exception:
            # CLI 参数错误、未登录或启动失败时，子进程可能在读取 stdin 前就退出。
            # 这里不能让 Broken pipe 覆盖真正的 stderr；继续收集输出后再按退出码失败。
            stdin_error_message = f"写入命令输入失败，进程可能已提前退出：{exception}"
            _append_workspace_log(workspace_log_file, stdin_error_message)
            try:
                process.stdin.close()
            except Exception:
                pass

    timed_out = False
    canceled = False
    while True:
        if should_cancel is not None and should_cancel():
            canceled = True
            _terminate_process_tree(process)
            break
        if monotonic() >= deadline:
            timed_out = True
            _terminate_process_tree(process)
            break
        try:
            stream_kind, text = queue.get(timeout=0.2)
            if stream_kind == "stdout":
                stdout_collected.append(text)
                stdout_buffer.append(text)
            elif stream_kind == "stderr":
                stderr_collected.append(text)
                stderr_buffer.append(text)
        except Empty:
            pass

        now = monotonic()
        if stdout_buffer and (_buffer_size(stdout_buffer) >= 4096 or now - last_flush >= 1):
            batcher.emit("stdout_chunk", stream_kind="stdout", text="\n".join(stdout_buffer), current_command=command_label)
            stdout_buffer = []
            last_flush = now
        if stderr_buffer and (_buffer_size(stderr_buffer) >= 4096 or now - last_flush >= 1):
            batcher.emit("stderr_chunk", stream_kind="stderr", text="\n".join(stderr_buffer), current_command=command_label)
            stderr_buffer = []
            last_flush = now
        if now - last_heartbeat >= 5:
            batcher.emit("heartbeat", summary=f"执行中：{command_label}", current_command=command_label)
            batcher.flush()
            last_heartbeat = now

        if process.poll() is not None and stdout_done.is_set() and stderr_done.is_set() and queue.empty():
            break

    if stdout_buffer:
        batcher.emit("stdout_chunk", stream_kind="stdout", text="\n".join(stdout_buffer), current_command=command_label)
    if stderr_buffer:
        batcher.emit("stderr_chunk", stream_kind="stderr", text="\n".join(stderr_buffer), current_command=command_label)
    batcher.flush()

    exit_code = process.wait()
    stdout = "\n".join(stdout_collected).strip()
    stderr = "\n".join(stderr_collected).strip()
    if stdin_error_message and not stderr:
        stderr = stdin_error_message
    if stdout_file is not None and stdout and not stdout_file.exists():
        stdout_file.parent.mkdir(parents=True, exist_ok=True)
        stdout_file.write_text(stdout + "\n", encoding="utf-8")
    if stderr_file is not None and stderr and not stderr_file.exists():
        stderr_file.parent.mkdir(parents=True, exist_ok=True)
        stderr_file.write_text(stderr + "\n", encoding="utf-8")
    if timed_out:
        timeout_message = f"命令执行超时，超过 {timeout_seconds} 秒"
        stderr = f"{stderr}\n{timeout_message}".strip()
        _append_workspace_log(workspace_log_file, timeout_message)
        exit_code = -1
    if canceled:
        stderr = f"{stderr}\n{cancel_message}".strip()
        _append_workspace_log(workspace_log_file, cancel_message)
        exit_code = -2
    return StreamingProcessResult(stdout=stdout, stderr=stderr, exit_code=exit_code, timed_out=timed_out, canceled=canceled)


def upload_log_artifacts(
    *,
    session_id: str,
    task_id: str,
    run_id: str,
    step_id: str,
    files: list[tuple[str, str, Path]],
) -> list[dict[str, object]]:
    client = _build_minio_client()
    _ensure_bucket(client)
    prefix = f"execution-sessions/task-{_safe_slug(task_id)}/run-{_safe_slug(run_id)}/step-{_safe_slug(step_id)}/{_safe_slug(session_id)}"
    artifacts: list[dict[str, object]] = []
    for artifact_type, title, file_path in files:
        if not file_path.exists():
            continue
        if file_path.is_dir():
            continue
        object_key = f"{prefix}/{file_path.name}"
        content_type = mimetypes.guess_type(file_path.name)[0] or "text/plain"
        client.fput_object(settings.minio_bucket, object_key, str(file_path), content_type=content_type)
        preview_text = _read_artifact_preview(file_path, content_type)
        artifacts.append(
            {
                "artifactType": artifact_type,
                "title": title,
                "contentRef": object_key,
                "contentText": preview_text,
            }
        )
    return artifacts


def tail_text(text: str, max_chars: int) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[-max_chars:]


def _post_backend_json(
    path: str,
    payload: dict[str, object],
    *,
    raise_errors: bool = True,
    retry_seconds: float = 0.0,
) -> bool:
    headers = {"Authorization": f"Bearer {settings.internal_service_token}"}
    deadline = monotonic() + max(retry_seconds, 0.0)
    last_exception: Exception | None = None
    while True:
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(f"{settings.backend_internal_base_url}{path}", json=payload, headers=headers)
                response.raise_for_status()
                return True
        except Exception as exception:
            last_exception = exception
            if monotonic() >= deadline:
                break
            sleep(0.5)
    if raise_errors and last_exception is not None:
        raise last_exception
    return False


def _start_stream_reader(
    stream,
    stream_kind: str,
    queue: Queue[tuple[str, str]],
    done_event: threading.Event,
    target_file: Path | None,
    workspace_log_file: Path,
) -> None:
    def _reader() -> None:
        try:
            if stream is None:
                return
            for line in iter(stream.readline, ""):
                text = line.rstrip("\n")
                if not text:
                    continue
                if target_file is not None:
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    with target_file.open("a", encoding="utf-8") as handle:
                        handle.write(text + "\n")
                _append_workspace_log(workspace_log_file, f"[{stream_kind}] {text}")
                queue.put((stream_kind, text))
        finally:
            try:
                if stream is not None:
                    stream.close()
            finally:
                done_event.set()

    threading.Thread(target=_reader, daemon=True).start()


def _append_workspace_log(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


def _build_minio_client() -> Minio:
    secure = settings.minio_endpoint.lower().startswith("https://")
    endpoint = settings.minio_endpoint.replace("https://", "").replace("http://", "")
    return Minio(endpoint, access_key=settings.minio_access_key, secret_key=settings.minio_secret_key, secure=secure)


def _ensure_bucket(client: Minio) -> None:
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def _buffer_size(lines: list[str]) -> int:
    return sum(len(item) for item in lines)


def _safe_slug(value: str) -> str:
    cleaned = "".join(char if char.isalnum() else "-" for char in (value or "default"))
    cleaned = cleaned.strip("-").lower()
    return cleaned or "default"


def _read_artifact_preview(file_path: Path, content_type: str) -> str:
    """文本产物保留尾部预览，二进制产物只返回简短说明，避免错误地按 UTF-8 解码截图或压缩包。"""
    normalized_type = (content_type or "").lower()
    if normalized_type.startswith("text/") or normalized_type in {
        "application/json",
        "application/xml",
        "application/javascript",
    }:
        try:
            content = file_path.read_text(encoding="utf-8").strip()
        except UnicodeDecodeError:
            return f"二进制产物：{file_path.name}"
        return tail_text(content, 4000) if content else ""
    return f"二进制产物：{file_path.name}"


def _terminate_process_tree(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass
