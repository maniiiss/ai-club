package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.RuntimeEventEntity;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

/**
 * Runtime 统一事件到执行中心事件的兼容桥。
 *
 * 业务意图：Pi 或其他 Runtime 只需要回传中性事件，详情页继续消费原有
 * execution-step-event 协议；桥接失败不会重复推进任务状态，原始事件仍保留在 runtime_event 中。
 */
@Service
public class RuntimeExecutionEventBridgeService {

    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionEventService executionEventService;
    private final ObjectMapper objectMapper;

    public RuntimeExecutionEventBridgeService(ExecutionStepRepository executionStepRepository,
                                              ExecutionEventService executionEventService,
                                              ObjectMapper objectMapper) {
        this.executionStepRepository = executionStepRepository;
        this.executionEventService = executionEventService;
        this.objectMapper = objectMapper;
    }

    public void bridge(RuntimeEventEntity runtimeEvent) {
        ExecutionStepEntity step = executionStepRepository.findByRunnerSessionId(runtimeEvent.getSessionId()).orElse(null);
        if (step == null || step.getRun() == null) {
            // 聊天 Runtime 没有执行中心步骤，原始事件仍可供会话恢复和审计使用。
            return;
        }
        ExecutionRunEntity run = step.getRun();
        JsonNode payload = readPayload(runtimeEvent.getPayloadJson());
        String eventType = runtimeEvent.getEventType();
        String text = text(payload, "delta", text(payload, "message", text(payload, "summary", "")));
        switch (eventType) {
            case "RUN_STARTED" -> executionEventService.recordStepStarted(
                    run.getExecutionTask(), run, step, text.isBlank() ? "Runtime 已开始运行" : text);
            case "TEXT_DELTA" -> executionEventService.recordTextChunk(
                    run.getExecutionTask(), run, step, "stdout", text(payload, "delta", ""));
            case "TOOL_PROGRESS" -> executionEventService.recordProgress(
                    run.getExecutionTask(), run, step, integer(payload, "progressPercent"), text);
            case "RUN_COMPLETED" -> executionEventService.recordStepFinished(
                    run.getExecutionTask(), run, step, text.isBlank() ? "Runtime 运行完成" : text);
            case "RUN_FAILED" -> append(run, step, "step_failed", text.isBlank() ? "Runtime 运行失败" : text, payload);
            case "TOOL_CALL_REQUESTED", "TOOL_FINISHED", "AWAITING_CONFIRMATION" -> append(
                    run, step, eventType.toLowerCase(java.util.Locale.ROOT), text, payload);
            default -> append(run, step, "runtime_event", text, payload);
        }
    }

    private void append(ExecutionRunEntity run,
                        ExecutionStepEntity step,
                        String eventType,
                        String summary,
                        JsonNode payload) {
        ObjectNode eventPayload = payload != null && payload.isObject()
                ? ((ObjectNode) payload).deepCopy()
                : objectMapper.createObjectNode();
        eventPayload.put("summary", summary == null ? "" : summary);
        executionEventService.appendEvent(run.getExecutionTask(), run, step, eventType, "runtime", eventPayload);
    }

    private JsonNode readPayload(String payloadJson) {
        try {
            return objectMapper.readTree(payloadJson == null ? "{}" : payloadJson);
        } catch (Exception ignored) {
            return objectMapper.createObjectNode();
        }
    }

    private String text(JsonNode node, String field, String fallback) {
        if (node != null && node.hasNonNull(field)) return node.get(field).asText(fallback);
        return fallback == null ? "" : fallback;
    }

    private Integer integer(JsonNode node, String field) {
        return node != null && node.has(field) && node.get(field).canConvertToInt()
                ? node.get(field).asInt() : null;
    }
}
