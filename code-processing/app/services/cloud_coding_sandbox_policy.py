"""Cloud Coding Worker 的版本化 Sandbox 安全契约。

P0 只冻结 Worker 必须满足的边界，不在这里启动容器或暴露 Cloud Coding API。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


class SandboxPolicyError(ValueError):
    """请求违反 Cloud Coding Sandbox 安全基线。"""


@dataclass(frozen=True)
class CloudCodingSandboxPolicy:
    """容器 Worker 的可审计策略快照，字段变更必须升级 policy_version。"""

    policy_version: str = "cloud-coding-sandbox-v1"
    run_as_user: str = "1000:1000"
    workspace_mount_target: str = "/workspace"
    network_mode: str = "allowlist"
    network_allowlist: tuple[str, ...] = ("api.openai.com", "api.anthropic.com")
    cpu_limit: float = 2.0
    memory_limit_mb: int = 4096
    pids_limit: int = 512
    timeout_seconds: int = 1800

    def __post_init__(self) -> None:
        if self.run_as_user in {"0", "0:0", "root"} or self.run_as_user.lower().startswith("root"):
            raise SandboxPolicyError("Sandbox Worker 禁止 root 用户")
        if self.network_mode != "allowlist":
            raise SandboxPolicyError("Sandbox 网络模式必须是 allowlist")
        if self.cpu_limit <= 0 or self.memory_limit_mb <= 0 or self.pids_limit <= 0:
            raise SandboxPolicyError("Sandbox 资源限制必须为正数")

    def validate_workspace_path(self, workspace_root: str | Path, session_id: str, workspace_path: str | Path) -> Path:
        """校验 workspace 只能位于当前 session 的独立目录内。"""
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", session_id or ""):
            raise SandboxPolicyError("Cloud Coding session id 非法")
        root = Path(workspace_root).expanduser().resolve(strict=False)
        session_root = (root / session_id).resolve(strict=False)
        candidate = Path(workspace_path).expanduser().resolve(strict=False)
        self._require_inside(session_root, candidate, "workspace 路径必须位于当前 session 目录内")
        if candidate == root:
            raise SandboxPolicyError("不允许把 Cloud Coding 根目录作为 workspace")
        return candidate

    def validate_workspace_delete(self, workspace_root: str | Path, session_id: str, target: str | Path) -> Path:
        """清理前拒绝删除 Cloud Coding 根目录，并阻止跨 session 删除。"""
        root = Path(workspace_root).expanduser().resolve(strict=False)
        candidate = Path(target).expanduser().resolve(strict=False)
        if candidate == root:
            raise SandboxPolicyError("不允许删除 Cloud Coding 根目录")
        return self.validate_workspace_path(root, session_id, candidate)

    def validate_mounts(
        self,
        mounts: list[Mapping[str, Any]],
        workspace_root: str | Path,
        session_id: str,
    ) -> list[dict[str, Any]]:
        """只允许当前 session 的 workspace 挂载，拒绝宿主机凭据和危险设备。"""
        root = Path(workspace_root).expanduser().resolve(strict=False)
        session_root = (root / session_id).resolve(strict=False)
        normalized: list[dict[str, Any]] = []
        for mount in mounts:
            source = str(mount.get("source", "")).strip()
            target = str(mount.get("target", "")).strip()
            if not source or not target:
                raise SandboxPolicyError("Sandbox mount 必须包含 source 和 target")
            source_path = Path(source).expanduser().resolve(strict=False)
            target_path = target.replace("\\", "/")
            if target_path != self.workspace_mount_target:
                raise SandboxPolicyError("Sandbox 只允许挂载到 /workspace")
            self._require_inside(session_root, source_path, "Sandbox mount source 必须属于当前 session")
            # source 已经被限制在当前 session 根目录；解析真实路径后可避免 session 内符号链接跳到 home。
            # 对容器内 target 仍保留宿主凭据目录和 Docker Socket 的显式拒绝。
            if self._is_sensitive_host_path(Path(target_path)):
                raise SandboxPolicyError("Sandbox 禁止挂载宿主机 home、凭据目录或 Docker Socket")
            normalized.append({
                "source": str(source_path),
                "target": self.workspace_mount_target,
                "read_only": bool(mount.get("read_only", False)),
            })
        return normalized

    def build_container_spec(
        self,
        workspace_root: str | Path,
        session_id: str,
        workspace_path: str | Path,
        mounts: list[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """构造 Worker 启动契约，供 P1 容器适配器原样落实并回报 policy digest。"""
        workspace = self.validate_workspace_path(workspace_root, session_id, workspace_path)
        requested_mounts = mounts or [{"source": str(workspace), "target": self.workspace_mount_target}]
        safe_mounts = self.validate_mounts(requested_mounts, workspace_root, session_id)
        return {
            "policyVersion": self.policy_version,
            "user": self.run_as_user,
            "workingDirectory": self.workspace_mount_target,
            "network": {"mode": self.network_mode, "allowlist": list(self.network_allowlist)},
            "resources": {
                "cpu": self.cpu_limit,
                "memoryMb": self.memory_limit_mb,
                "pids": self.pids_limit,
                "timeoutSeconds": self.timeout_seconds,
            },
            "mounts": safe_mounts,
            "security": {
                "privileged": False,
                "readOnlyRootFilesystem": True,
                "noNewPrivileges": True,
                "hostHome": False,
                "dockerSocket": False,
                "credentials": False,
            },
        }

    @staticmethod
    def _require_inside(root: Path, candidate: Path, message: str) -> None:
        try:
            candidate.relative_to(root)
        except ValueError as error:
            raise SandboxPolicyError(message) from error

    @staticmethod
    def _is_sensitive_host_path(path: Path) -> bool:
        normalized = str(path).replace("\\", "/").lower()
        home = str(Path.home().resolve(strict=False)).replace("\\", "/").lower()
        sensitive_names = ("/.ssh", "/.aws", "/.config", "/.npmrc", "/.pypirc", "docker.sock")
        return normalized == home or normalized.startswith(home + "/") or any(name in normalized for name in sensitive_names)


DEFAULT_CLOUD_CODING_SANDBOX_POLICY = CloudCodingSandboxPolicy()


def sandbox_policy_from_environment() -> CloudCodingSandboxPolicy:
    """读取可审计的资源/网络覆盖；身份与挂载安全规则不允许环境变量放宽。"""
    allowlist = tuple(item.strip() for item in os.getenv("PLATFORM_CLOUD_CODING_NETWORK_ALLOWLIST", "api.openai.com,api.anthropic.com").split(",") if item.strip())
    return CloudCodingSandboxPolicy(
        network_allowlist=allowlist,
        cpu_limit=float(os.getenv("PLATFORM_CLOUD_CODING_CPU_LIMIT", "2")),
        memory_limit_mb=int(os.getenv("PLATFORM_CLOUD_CODING_MEMORY_MB", "4096")),
        pids_limit=int(os.getenv("PLATFORM_CLOUD_CODING_PIDS_LIMIT", "512")),
        timeout_seconds=int(os.getenv("PLATFORM_CLOUD_CODING_TIMEOUT_SECONDS", "1800")),
    )
