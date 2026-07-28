from unittest.mock import patch

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import model_usage_reporter


def test_should_skip_when_usage_missing():
    """provider 未返回 usage 时不上报，避免空记录污染统计。"""
    with patch.object(model_usage_reporter, "_post_backend_json") as post:
        model_usage_reporter.report_model_usage(
            agent_type="CODE_REVIEW",
            provider="OPENAI",
            model_name="gpt-4o",
            usage=None,
            duration_ms=100,
        )
        post.assert_not_called()


def test_should_post_event_with_correct_payload_and_retry():
    """有 usage 时按内部回传协议上报，并使用 fire-and-forget 重试策略。"""
    with patch.object(model_usage_reporter, "_post_backend_json") as post:
        model_usage_reporter.report_model_usage(
            agent_type="CODE_REVIEW",
            provider="OPENAI",
            model_name="gpt-4o",
            usage={"prompt_tokens": 120, "completion_tokens": 45, "total_tokens": 165},
            duration_ms=2300,
            biz_id=2001,
            model_config_id=7,
            user_id=101,
            project_id=5,
            action="REVIEW",
        )
        post.assert_called_once()
        args, kwargs = post.call_args
        assert args[0] == "/internal/model-usage/events"
        payload = args[1]
        assert "events" in payload
        event = payload["events"][0]
        assert event["agentType"] == "CODE_REVIEW"
        assert event["provider"] == "OPENAI"
        assert event["modelName"] == "gpt-4o"
        assert event["promptTokens"] == 120
        assert event["completionTokens"] == 45
        assert event["totalTokens"] == 165
        assert event["durationMs"] == 2300
        assert event["status"] == "SUCCESS"
        assert event["modelConfigId"] == 7
        assert event["bizId"] == 2001
        assert event["userId"] == 101
        assert event["projectId"] == 5
        assert event["action"] == "REVIEW"
        assert event["usageKey"]
        assert kwargs["raise_errors"] is False
        assert kwargs["retry_seconds"] == 10.0


def test_should_not_raise_when_post_fails():
    """上报链路异常绝不外抛，保证主业务（代码审核）不受影响。"""
    with patch.object(model_usage_reporter, "_post_backend_json", side_effect=RuntimeError("boom")):
        # 不应抛异常
        model_usage_reporter.report_model_usage(
            agent_type="CODE_REVIEW",
            provider="OPENAI",
            model_name="gpt-4o",
            usage={"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
            duration_ms=10,
        )
