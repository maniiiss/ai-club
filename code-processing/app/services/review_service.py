import json
import logging
import re
from typing import Any

import httpx

from app.models import ReviewRequest, ReviewResponse

logger = logging.getLogger(__name__)


class ReviewProviderError(RuntimeError):
    """封装上游模型调用失败，便于接口层返回可读的 4xx 信息。"""


def review_code(request: ReviewRequest) -> ReviewResponse:
    provider = request.provider.strip().upper()
    prompt = _build_prompt(request)
    logger.info(
        "Starting code review: provider=%s, model=%s, api_base_url=%s, change_count=%s",
        provider,
        request.model,
        request.apiBaseUrl.rstrip("/"),
        len(request.changes),
    )
    raw_text = _call_provider(provider, request.apiBaseUrl.rstrip("/"), request.apiKey, request.model, prompt)
    logger.info("Code review raw model response excerpt: %s", _abbreviate(raw_text, 1000))
    payload = _extract_json(raw_text)

    approved = bool(payload.get("approved", False))
    summary = _string_value(payload.get("summary")) or "Review summary is missing"
    issues = _normalize_issues(payload.get("issues"))
    review_markdown = _string_value(payload.get("reviewMarkdown"))
    if not review_markdown:
        review_markdown = _build_fallback_markdown(approved, summary, issues)

    logger.info(
        "Code review parsed successfully: provider=%s, model=%s, approved=%s, issue_count=%s",
        provider,
        request.model,
        approved,
        len(issues),
    )

    return ReviewResponse(
        approved=approved,
        summary=summary,
        provider=provider,
        issues=issues,
        reviewMarkdown=review_markdown,
    )


def _build_prompt(request: ReviewRequest) -> str:
    changes_text = []
    for index, change in enumerate(request.changes, start=1):
        changes_text.append(
            f"""### Change {index}
old_path: {change.oldPath}
new_path: {change.newPath}
new_file: {change.newFile}
deleted_file: {change.deletedFile}
renamed_file: {change.renamedFile}
diff:
{_trim_diff(change.diff)}
"""
        )
    joined_changes = "\n".join(changes_text) if changes_text else "No file changes"

    return f"""
{request.prompt}

You are reviewing a Merge Request for auto-merge.
Please respond in Chinese and return valid JSON only. Do not output markdown code fences or any extra commentary.
Use this exact JSON shape:
{{
  "approved": false,
  "summary": "One-sentence conclusion about whether auto-merge is safe",
  "issues": ["Issue 1", "Issue 2"],
  "reviewMarkdown": "# 代码审查\n- 审查结论：建议暂不合并\n- 摘要：存在高风险问题，建议暂不自动合并\n\n## 发现的问题\n- service 层缺少空值判断，可能导致运行时异常\n\n## 修改建议\n- 补充空值校验与对应测试用例"
}}

Rules:
1. reviewMarkdown must be Markdown and must be written in Chinese.
2. If there is any high-risk issue, approved must be false.
3. If there is no obvious issue, issues must be an empty array.
4. reviewMarkdown should be clear and practical, and should include sections for conclusion, issues, and suggestions.
5. Return JSON only.

MR Title:
{request.mergeRequestTitle}

MR Description:
{request.mergeRequestDescription}

Changes:
{joined_changes}
""".strip()


def _trim_diff(diff: str, max_chars: int = 12000) -> str:
    if len(diff) <= max_chars:
        return diff
    return diff[:max_chars] + "\n...diff truncated..."


def _call_provider(provider: str, api_base_url: str, api_key: str, model: str, prompt: str) -> str:
    with httpx.Client(timeout=60.0, http2=False) as client:
        if provider == "OPENAI":
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            response = client.post(
                f"{api_base_url}/responses",
                headers=headers,
                json={
                    "model": model,
                    "input": prompt,
                    "temperature": 0,
                    "text": {
                        "format": {
                            "type": "json_object"
                        }
                    },
                },
            )
            if response.status_code == 404 or _should_retry_with_chat_completions(api_base_url, response):
                fallback_response = client.post(
                    f"{api_base_url}/chat/completions",
                    headers=headers,
                    json={
                        "model": model,
                        "temperature": 0,
                        "response_format": {"type": "json_object"},
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                _raise_for_provider_error("OPENAI chat/completions", fallback_response)
                return _extract_openai_chat_text(fallback_response.json())

            _raise_for_provider_error("OPENAI responses", response)
            return _extract_openai_text(response.json())

        if provider == "ANTHROPIC":
            response = client.post(
                f"{api_base_url}/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 1600,
                    "temperature": 0,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            _raise_for_provider_error("ANTHROPIC messages", response)
            return _extract_anthropic_text(response.json())

    raise ValueError(f"Unsupported provider: {provider}")


def _should_retry_with_chat_completions(api_base_url: str, response: httpx.Response) -> bool:
    """OpenAI 兼容网关在 /responses 不兼容时，按特征切回 chat/completions。"""
    if response.status_code != 400:
        return False
    lower_base_url = api_base_url.lower()
    if "volces.com" in lower_base_url or "ark" in lower_base_url:
        return True
    body = _abbreviate(response.text, 1000).lower()
    return "responses" in body and ("unsupported" in body or "not support" in body)


def _raise_for_provider_error(provider_label: str, response: httpx.Response) -> None:
    """统一收口模型供应商错误，避免接口直接抛成 500。"""
    if response.is_success:
        return
    detail = _format_provider_error_detail(response)
    logger.warning(
        "Code review provider call failed: provider=%s, status=%s, url=%s, response=%s",
        provider_label,
        response.status_code,
        response.request.url,
        detail,
    )
    raise ReviewProviderError(f"{provider_label} 调用失败，HTTP {response.status_code}：{detail}")


def _format_provider_error_detail(response: httpx.Response) -> str:
    """尽量从上游响应体中提炼出可读错误，方便后端和页面直接定位。"""
    text = (response.text or "").strip()
    if not text:
        return "上游未返回错误详情"
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return _abbreviate(text, 500)
    message_candidates = [
        payload.get("message"),
        payload.get("error"),
        payload.get("detail"),
    ]
    for candidate in message_candidates:
        if isinstance(candidate, str) and candidate.strip():
            return _abbreviate(candidate.strip(), 500)
        if isinstance(candidate, dict):
            nested_message = candidate.get("message") or candidate.get("detail") or candidate.get("type")
            if isinstance(nested_message, str) and nested_message.strip():
                return _abbreviate(nested_message.strip(), 500)
    return _abbreviate(json.dumps(payload, ensure_ascii=False), 500)


def _extract_openai_text(body: dict[str, Any]) -> str:
    if isinstance(body.get("output_text"), str) and body["output_text"].strip():
        return body["output_text"]

    for output in body.get("output", []):
        for content in output.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return content["text"]
    return json.dumps(body, ensure_ascii=False)


def _extract_anthropic_text(body: dict[str, Any]) -> str:
    for content in body.get("content", []):
        if content.get("type") == "text" and content.get("text"):
            return content["text"]
    return json.dumps(body, ensure_ascii=False)


def _extract_openai_chat_text(body: dict[str, Any]) -> str:
    choices = body.get("choices", [])
    if choices:
        message = choices[0].get("message", {})
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content
    return json.dumps(body, ensure_ascii=False)


def _extract_json(text: str) -> dict[str, Any]:
    stripped = _normalize_response_text(text)
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, char in enumerate(stripped):
            if char != "{":
                continue
            try:
                payload, _ = decoder.raw_decode(stripped[index:])
                if isinstance(payload, dict):
                    return payload
            except json.JSONDecodeError:
                continue
    logger.warning("Model did not return valid JSON. Raw response excerpt: %s", _abbreviate(stripped, 1000))
    raise ValueError("Model did not return valid JSON")


def _string_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_issues(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None:
        return []
    text = str(value).strip()
    return [text] if text else []


def _build_fallback_markdown(approved: bool, summary: str, issues: list[str]) -> str:
    decision_text = "建议合并" if approved else "建议暂不合并"
    summary_text = summary or "未提供摘要"
    lines = [
        "# 代码审查",
        f"- 审查结论：{decision_text}",
        f"- 摘要：{summary_text}",
        "",
        "## 发现的问题",
    ]
    if issues:
        lines.extend(f"- {issue}" for issue in issues)
    else:
        lines.append("- 未识别到明确问题")
    lines.extend([
        "",
        "## 修改建议",
        "- 请结合上述问题补充修复或说明，再重新发起审查。",
    ])
    return "\n".join(lines)


def _abbreviate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return value[:max_chars] + "...(truncated)"


def _normalize_response_text(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return stripped

    # Drop common reasoning wrappers before attempting to parse JSON.
    stripped = re.sub(r"<think>.*?</think>", "", stripped, flags=re.DOTALL | re.IGNORECASE).strip()
    stripped = re.sub(r"^<think>.*?(?=\{)", "", stripped, flags=re.DOTALL | re.IGNORECASE).strip()
    stripped = re.sub(r"^```(?:json)?", "", stripped, flags=re.IGNORECASE).strip()
    stripped = re.sub(r"```$", "", stripped).strip()
    return stripped
