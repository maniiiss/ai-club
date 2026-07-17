import sys
import urllib.error
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.gitnexus_serve_manager import (
    _reset_gitnexus_serve_state_for_tests,
    _start_gitnexus_serve,
    ensure_gitnexus_serve_running,
    local_gitnexus_serve_base_url,
    probe_gitnexus_serve,
)


class GitnexusServeManagerTests(unittest.TestCase):
    """验证 GitNexus serve 的探活、复用和按需启动逻辑。"""

    def tearDown(self):
        _reset_gitnexus_serve_state_for_tests()

    def test_should_treat_http_error_as_reachable(self):
        with patch("app.services.gitnexus_serve_manager.urllib.request.urlopen", side_effect=urllib.error.HTTPError("http://localhost:4747", 404, "Not Found", {}, None)):
            self.assertTrue(probe_gitnexus_serve("http://localhost:4747"))

    def test_should_probe_loopback_ipv4_when_bind_host_is_zero_address(self):
        self.assertEqual("http://127.0.0.1:4747", local_gitnexus_serve_base_url())

    def test_should_start_serve_with_explicit_host_and_port(self):
        with patch("app.services.gitnexus_serve_manager.subprocess.Popen") as popen_mock:
            _start_gitnexus_serve(Path("gitnexus"))

        command = popen_mock.call_args.args[0]
        self.assertEqual(["gitnexus", "serve", "--host", "0.0.0.0", "--port", "4747"], command)

    def test_should_reuse_existing_serve_when_probe_is_healthy(self):
        with patch("app.services.gitnexus_serve_manager._is_serve_reachable", return_value=True), \
                patch("app.services.gitnexus_serve_manager._start_gitnexus_serve") as start_mock:
            self.assertTrue(ensure_gitnexus_serve_running(Path("gitnexus")))
        start_mock.assert_not_called()

    def test_should_start_serve_when_probe_recovers_after_boot(self):
        probe_sequence = [False, False, True]
        with patch("app.services.gitnexus_serve_manager._is_serve_reachable", side_effect=lambda: probe_sequence.pop(0)), \
                patch("app.services.gitnexus_serve_manager._stop_stale_process_if_needed"), \
                patch("app.services.gitnexus_serve_manager._start_gitnexus_serve") as start_mock:
            self.assertTrue(ensure_gitnexus_serve_running(Path("gitnexus")))
        start_mock.assert_called_once()

    def test_should_raise_when_serve_never_becomes_ready(self):
        fake_process = MagicMock()
        fake_process.poll.return_value = 1
        with patch("app.services.gitnexus_serve_manager._is_serve_reachable", return_value=False), \
                patch("app.services.gitnexus_serve_manager._stop_stale_process_if_needed"), \
                patch("app.services.gitnexus_serve_manager._start_gitnexus_serve"), \
                patch("app.services.gitnexus_serve_manager._SERVE_PROCESS", fake_process):
            with self.assertRaisesRegex(RuntimeError, "未能在端口"):
                ensure_gitnexus_serve_running(Path("gitnexus"))
