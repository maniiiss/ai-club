package com.aiclub.platform.runtime;

import java.util.Map;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Collections;

/**
 * AgentRuntime 聊天流的统一事件。
 *
 * 业务意图：Runtime 只需要遵守统一事件协议，Assistant 会话和聊天室就可以
 * 复用同一套增量文本转发逻辑；新增 Runtime 不需要修改业务服务中的运行时分支。
 */
public record RuntimeStreamEvent(
        String runId,
        String sessionId,
        long sequence,
        String eventType,
        Map<String, Object> payload
) {
    public RuntimeStreamEvent {
        runId = runId == null ? "" : runId;
        sessionId = sessionId == null ? "" : sessionId;
        eventType = eventType == null ? "" : eventType.trim().toUpperCase(Locale.ROOT);
        payload = payload == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(payload));
    }

    /** 判断事件类型，集中处理 Runtime 之间大小写差异。 */
    public boolean is(String expectedType) {
        return expectedType != null && eventType.equalsIgnoreCase(expectedType.trim());
    }

    /** 提取统一文本增量；非文本事件返回空字符串。 */
    public String textDelta() {
        if (!is("TEXT_DELTA")) {
            return "";
        }
        Object delta = payload.get("delta");
        return delta == null ? "" : String.valueOf(delta);
    }

    /** 提取统一思考增量；非思考事件返回空字符串。 */
    public String thinkingDelta() {
        if (!is("THINKING_DELTA")) {
            return "";
        }
        Object delta = payload.get("delta");
        return delta == null ? "" : String.valueOf(delta);
    }
}
