"""验证 review_service._extract_usage 抽取并归一化缓存命中 token。"""
from app.services.review_service import _extract_usage


def test_extract_usage_openai_prompt_tokens_details_cached():
    body = {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150,
                      "prompt_tokens_details": {"cached_tokens": 60}}}
    assert _extract_usage(body)["cached_tokens"] == 60


def test_extract_usage_openai_input_tokens_details_cached():
    body = {"usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150,
                      "input_tokens_details": {"cached_tokens": 40}}}
    assert _extract_usage(body)["cached_tokens"] == 40


def test_extract_usage_anthropic_cache_read():
    body = {"usage": {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 80}}
    assert _extract_usage(body)["cached_tokens"] == 80


def test_extract_usage_无缓存字段不含cached_tokens():
    body = {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}}
    result = _extract_usage(body)
    assert "cached_tokens" not in result


def test_extract_usage_usage缺失返回none():
    assert _extract_usage({"foo": 1}) is None
