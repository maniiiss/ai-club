import tempfile
import unittest
from pathlib import Path

from app.services.cloud_coding_sandbox_policy import (
    CloudCodingSandboxPolicy,
    SandboxPolicyError,
)


class CloudCodingSandboxPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "cloud-coding"
        self.workspace = self.root / "session-a" / "repo"
        self.workspace.mkdir(parents=True)
        self.policy = CloudCodingSandboxPolicy()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_rejects_path_escape_and_cross_session_access(self):
        with self.assertRaises(SandboxPolicyError):
            self.policy.validate_workspace_path(self.root, "session-a", self.root / "session-b")
        with self.assertRaises(SandboxPolicyError):
            self.policy.validate_workspace_path(self.root, "session-a", self.root / "outside")

    def test_rejects_root_deletion_but_allows_current_session_cleanup(self):
        with self.assertRaises(SandboxPolicyError):
            self.policy.validate_workspace_delete(self.root, "session-a", self.root)
        self.assertEqual(
            self.policy.validate_workspace_delete(self.root, "session-a", self.root / "session-a"),
            self.root / "session-a",
        )

    def test_rejects_dangerous_mounts_and_keeps_workspace_mount(self):
        with self.assertRaises(SandboxPolicyError):
            self.policy.validate_mounts([{"source": str(Path.home()), "target": "/workspace"}], self.root, "session-a")
        with self.assertRaises(SandboxPolicyError):
            self.policy.validate_mounts([{"source": str(self.workspace), "target": "/root"}], self.root, "session-a")
        with self.assertRaises(SandboxPolicyError):
            self.policy.validate_mounts([{"source": "/var/run/docker.sock", "target": "/workspace"}], self.root, "session-a")

    def test_container_spec_is_non_root_and_resource_limited(self):
        spec = self.policy.build_container_spec(self.root, "session-a", self.workspace)
        self.assertNotIn(spec["user"], {"0", "0:0", "root"})
        self.assertEqual(spec["policyVersion"], "cloud-coding-sandbox-v1")
        self.assertFalse(spec["security"]["privileged"])
        self.assertTrue(spec["security"]["noNewPrivileges"])
        self.assertEqual(spec["mounts"][0]["target"], "/workspace")


if __name__ == "__main__":
    unittest.main()
