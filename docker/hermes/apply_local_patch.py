from __future__ import annotations

import sys
from pathlib import Path


def replace_once(source: str, old: str, new: str, *, description: str) -> str:
    """执行一次精确替换；锚点缺失时直接失败，避免静默生成半成品镜像。"""
    if old not in source:
        raise RuntimeError(f"未找到补丁锚点：{description}")
    return source.replace(old, new, 1)


def patch_api_server(content: str) -> str:
    """为 Hermes API Server 注入 reasoning -> <think> 透传与历史剥离逻辑。"""
    content = replace_once(
        content,
        'MAX_CONTENT_LIST_SIZE = 1_000  # Max items when content is an array\n',
        """MAX_CONTENT_LIST_SIZE = 1_000  # Max items when content is an array

_THINK_BLOCK_RE = re.compile(r"(?is)<think>.*?</think>")


def _strip_assistant_think_blocks(content: Any) -> Any:
    \"\"\"移除 assistant 历史消息中的 `<think>`，避免把思考过程再次喂回模型。\"\"\"
    if isinstance(content, str):
        return _THINK_BLOCK_RE.sub("", content).strip()
    if not isinstance(content, list):
        return content
    normalized_parts: List[Dict[str, Any]] = []
    for part in content:
        if not isinstance(part, dict):
            normalized_parts.append(part)
            continue
        normalized_part = dict(part)
        if str(normalized_part.get("type") or "").strip().lower() in _TEXT_PART_TYPES:
            text = normalized_part.get("text")
            if isinstance(text, str):
                normalized_part["text"] = _THINK_BLOCK_RE.sub("", text).strip()
        normalized_parts.append(normalized_part)
    return normalized_parts


def _strip_think_blocks_from_history(history: Any) -> Any:
    \"\"\"统一清洗历史对话中的 assistant 思考块，兼容请求体历史与 SessionDB 历史。\"\"\"
    if not isinstance(history, list):
        return history
    cleaned_history: List[Dict[str, Any]] = []
    for entry in history:
        if not isinstance(entry, dict):
            cleaned_history.append(entry)
            continue
        normalized_entry = dict(entry)
        if normalized_entry.get("role") == "assistant":
            normalized_entry["content"] = _strip_assistant_think_blocks(normalized_entry.get("content", ""))
        cleaned_history.append(normalized_entry)
    return cleaned_history


def _resolve_last_reasoning_from_result(result: Any) -> str:
    \"\"\"优先返回原生 last_reasoning；为空时从最新 assistant message 的 reasoning 字段回捞。\"\"\"
    if not isinstance(result, dict):
        return ""
    direct_reasoning = str(result.get("last_reasoning") or "").strip()
    if direct_reasoning:
        return direct_reasoning
    messages = result.get("messages")
    if not isinstance(messages, list):
        return ""
    for message in reversed(messages):
        if not isinstance(message, dict):
            continue
        if str(message.get("role") or "").strip().lower() != "assistant":
            continue
        for field_name in ("reasoning_content", "reasoning"):
            field_value = message.get(field_name)
            if isinstance(field_value, str) and field_value.strip():
                return field_value.strip()
    return ""

""",
        description="注入 think 清洗辅助函数",
    )

    content = replace_once(
        content,
        """            elif role in {"user", "assistant"}:
                try:
                    content = _normalize_multimodal_content(raw_content)
                except ValueError as exc:
                    return _multimodal_validation_error(exc, param=f"messages[{idx}].content")
                conversation_messages.append({"role": role, "content": content})
""",
        """            elif role in {"user", "assistant"}:
                try:
                    content = _normalize_multimodal_content(raw_content)
                except ValueError as exc:
                    return _multimodal_validation_error(exc, param=f"messages[{idx}].content")
                if role == "assistant":
                    content = _strip_assistant_think_blocks(content)
                conversation_messages.append({"role": role, "content": content})
""",
        description="清洗请求体中的 assistant think 块",
    )

    content = replace_once(
        content,
        "                    history = db.get_messages_as_conversation(session_id)\n",
        "                    history = _strip_think_blocks_from_history(db.get_messages_as_conversation(session_id))\n",
        description="清洗 SessionDB 历史中的 assistant think 块",
    )

    content = replace_once(
        content,
        """        if stream:
            import queue as _q
            _stream_q: _q.Queue = _q.Queue()
""",
        """        if stream:
            import queue as _q
            _stream_q: _q.Queue = _q.Queue()
            _reasoning_open = False
            _reasoning_seen = False
""",
        description="初始化流式 reasoning 状态",
    )

    content = replace_once(
        content,
        """            def _on_delta(delta):
                # Filter out None — the agent fires stream_delta_callback(None)
                # to signal the CLI display to close its response box before
                # tool execution, but the SSE writer uses None as end-of-stream
                # sentinel.  Forwarding it would prematurely close the HTTP
                # response, causing Open WebUI (and similar frontends) to miss
                # the final answer after tool calls.  The SSE loop detects
                # completion via agent_task.done() instead.
                if delta is not None:
                    _stream_q.put(delta)
""",
        """            def _on_delta(delta):
                # Filter out None — the agent fires stream_delta_callback(None)
                # to signal the CLI display to close its response box before
                # tool execution, but the SSE writer uses None as end-of-stream
                # sentinel.  Forwarding it would prematurely close the HTTP
                # response, causing Open WebUI (and similar frontends) to miss
                # the final answer after tool calls.  The SSE loop detects
                # completion via agent_task.done() instead.
                nonlocal _reasoning_open
                if delta is not None:
                    if _reasoning_open:
                        _stream_q.put("</think>")
                        _reasoning_open = False
                    _stream_q.put(delta)
""",
        description="正文分片前自动闭合 think 块",
    )

    content = replace_once(
        content,
        """            def _on_tool_complete(tool_call_id, function_name, function_args, function_result):
                \"\"\"Emit the matching ``status: completed`` event.

                Dropped if the start was filtered (internal tool, missing
                id, or never seen) so clients never get an orphaned
                ``completed`` they can't correlate to a prior ``running``.
                \"\"\"
                if not tool_call_id or tool_call_id not in _started_tool_call_ids:
                    return
                _started_tool_call_ids.discard(tool_call_id)
                _stream_q.put(("__tool_progress__", {
                    "tool": function_name,
                    "toolCallId": tool_call_id,
                    "status": "completed",
                }))

            # Start agent in background.  agent_ref is a mutable container
""",
        """            def _on_tool_complete(tool_call_id, function_name, function_args, function_result):
                \"\"\"Emit the matching ``status: completed`` event.

                Dropped if the start was filtered (internal tool, missing
                id, or never seen) so clients never get an orphaned
                ``completed`` they can't correlate to a prior ``running``.
                \"\"\"
                if not tool_call_id or tool_call_id not in _started_tool_call_ids:
                    return
                _started_tool_call_ids.discard(tool_call_id)
                _stream_q.put(("__tool_progress__", {
                    "tool": function_name,
                    "toolCallId": tool_call_id,
                    "status": "completed",
                }))

            def _on_tool_progress(event_type, tool_name=None, preview=None, args=None, **kwargs):
                \"\"\"把 reasoning.available 事件实时转成 `<think>` 分片；普通 tool_progress 仍继续忽略。\"\"\"
                nonlocal _reasoning_open, _reasoning_seen
                if event_type != "reasoning.available" or not preview:
                    return
                if not _reasoning_open:
                    _stream_q.put("<think>")
                    _reasoning_open = True
                _reasoning_seen = True
                _stream_q.put(str(preview))

            # Start agent in background.  agent_ref is a mutable container
""",
        description="接入 reasoning.available 回调",
    )

    content = replace_once(
        content,
        """                tool_start_callback=_on_tool_start,
                tool_complete_callback=_on_tool_complete,
                agent_ref=agent_ref,
                gateway_session_key=gateway_session_key,
            ))
""",
        """                tool_start_callback=_on_tool_start,
                tool_complete_callback=_on_tool_complete,
                tool_progress_callback=_on_tool_progress,
                agent_ref=agent_ref,
                gateway_session_key=gateway_session_key,
            ))
""",
        description="为 chat completions 流式调用接入 tool_progress_callback",
    )

    content = replace_once(
        content,
        """            try:
                result, agent_usage = await agent_task
                usage = agent_usage or usage
            except Exception as exc:
                logger.warning("Agent task %s failed, usage data lost: %s", completion_id, exc)

            # Finish chunk
""",
        """            try:
                result, agent_usage = await agent_task
                usage = agent_usage or usage
                if _reasoning_open:
                    last_activity = await _emit("</think>")
                    _reasoning_open = False
                elif not _reasoning_seen:
                    final_reasoning = _resolve_last_reasoning_from_result(result)
                    if final_reasoning:
                        last_activity = await _emit(f"<think>{final_reasoning}</think>")
            except Exception as exc:
                logger.warning("Agent task %s failed, usage data lost: %s", completion_id, exc)

            # Finish chunk
""",
        description="在流式收尾阶段补发最终 reasoning",
    )

    content = replace_once(
        content,
        '        final_response = result.get("final_response") or ""\n',
        """        final_response = result.get("final_response") or ""
        final_reasoning = _resolve_last_reasoning_from_result(result)
        if final_reasoning:
            final_response = f"<think>{final_reasoning}</think>\\n\\n{final_response}" if final_response else f"<think>{final_reasoning}</think>"
""",
        description="为非流式 chat completions 响应补上 think 块",
    )

    return content


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: apply_local_patch.py <api_server.py>")
    target_path = Path(sys.argv[1])
    original = target_path.read_text(encoding="utf-8")
    patched = patch_api_server(original)
    target_path.write_text(patched, encoding="utf-8")
    print(f"patched {target_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
