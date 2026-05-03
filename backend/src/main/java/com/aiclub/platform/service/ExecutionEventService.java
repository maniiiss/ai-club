package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionStepEventEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.ExecutionStreamEvent;
import com.aiclub.platform.dto.request.ExecutionSessionEventRequest;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepEventRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

/**
 * 执行中心事件服务。
 * 统一负责步骤事件落库、尾日志快照聚合、SSE 输出以及运行级游标恢复。
 */
@Service
public class ExecutionEventService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_TAIL_LINES = 200;
    private static final int MAX_TAIL_CHARS = 64 * 1024;
    private static final long STREAM_POLL_INTERVAL_MILLIS = 250L;
    private static final int STREAM_PING_IDLE_ROUNDS = 40;

    private final ExecutionStepEventRepository executionStepEventRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final ObjectMapper objectMapper;

    public ExecutionEventService(ExecutionStepEventRepository executionStepEventRepository,
                                 ExecutionStepRepository executionStepRepository,
                                 ExecutionRunRepository executionRunRepository,
                                 ExecutionTaskRepository executionTaskRepository,
                                 ObjectMapper objectMapper) {
        this.executionStepEventRepository = executionStepEventRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 记录步骤开始事件。
     * 同步与异步步骤都通过统一事件协议向前端暴露状态变化。
     */
    @Transactional
    public ExecutionStreamEvent recordStepStarted(ExecutionTaskEntity task,
                                                  ExecutionRunEntity run,
                                                  ExecutionStepEntity step,
                                                  String summary) {
        if (step == null || run == null) {
            return null;
        }
        if (summary != null && !summary.isBlank()) {
            step.setLatestMessage(limit(summary));
        }
        return appendEvent(task, run, step, "step_started", "system", payloadBuilder()
                .put("summary", defaultString(summary))
                .put("progressPercent", defaultProgress(step.getProgressPercent()))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordCommandStarted(ExecutionTaskEntity task,
                                                     ExecutionRunEntity run,
                                                     ExecutionStepEntity step,
                                                     String command) {
        if (step == null || run == null) {
            return null;
        }
        String normalized = limit(command);
        step.setCurrentCommand(defaultString(normalized));
        step.setLatestMessage(defaultString(normalized));
        return appendEvent(task, run, step, "command_started", "system", payloadBuilder()
                .put("currentCommand", defaultString(normalized))
                .put("summary", defaultString(normalized))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordTextChunk(ExecutionTaskEntity task,
                                                ExecutionRunEntity run,
                                                ExecutionStepEntity step,
                                                String streamKind,
                                                String text) {
        if (step == null || run == null) {
            return null;
        }
        String normalized = defaultString(text);
        appendTailLog(step, normalized);
        return appendEvent(task, run, step, "stdout".equalsIgnoreCase(streamKind) ? "stdout_chunk" : "stderr_chunk", streamKind, payloadBuilder()
                .put("text", normalized)
                .put("currentCommand", defaultString(step.getCurrentCommand()))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordHeartbeat(ExecutionTaskEntity task,
                                                ExecutionRunEntity run,
                                                ExecutionStepEntity step,
                                                String summary) {
        if (step == null || run == null) {
            return null;
        }
        step.setLastHeartbeatAt(LocalDateTime.now());
        if (summary != null && !summary.isBlank()) {
            step.setLatestMessage(limit(summary));
        }
        return appendEvent(task, run, step, "heartbeat", "system", payloadBuilder()
                .put("summary", defaultString(summary))
                .put("currentCommand", defaultString(step.getCurrentCommand()))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordProgress(ExecutionTaskEntity task,
                                               ExecutionRunEntity run,
                                               ExecutionStepEntity step,
                                               Integer progressPercent,
                                               String summary) {
        if (step == null || run == null) {
            return null;
        }
        if (progressPercent != null) {
            step.setProgressPercent(Math.max(0, Math.min(progressPercent, 100)));
        }
        if (summary != null && !summary.isBlank()) {
            step.setLatestMessage(limit(summary));
        }
        return appendEvent(task, run, step, "progress_changed", "system", payloadBuilder()
                .put("progressPercent", defaultProgress(step.getProgressPercent()))
                .put("summary", defaultString(summary))
                .put("currentCommand", defaultString(step.getCurrentCommand()))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordSummary(ExecutionTaskEntity task,
                                              ExecutionRunEntity run,
                                              ExecutionStepEntity step,
                                              String summary) {
        if (step == null || run == null) {
            return null;
        }
        if (summary != null && !summary.isBlank()) {
            step.setLatestMessage(limit(summary));
            if (task != null) {
                task.setLatestSummary(limit(summary));
            }
        }
        return appendEvent(task, run, step, "step_summary_updated", "system", payloadBuilder()
                .put("summary", defaultString(summary))
                .put("currentCommand", defaultString(step.getCurrentCommand()))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordArtifactReady(ExecutionTaskEntity task,
                                                    ExecutionRunEntity run,
                                                    ExecutionStepEntity step,
                                                    Long artifactId,
                                                    String summary) {
        if (run == null) {
            return null;
        }
        return appendEvent(task, run, step, "artifact_ready", "system", payloadBuilder()
                .put("artifactId", artifactId == null ? 0L : artifactId)
                .put("summary", defaultString(summary))
        );
    }

    @Transactional
    public ExecutionStreamEvent recordStepFinished(ExecutionTaskEntity task,
                                                   ExecutionRunEntity run,
                                                   ExecutionStepEntity step,
                                                   String summary) {
        if (step == null || run == null) {
            return null;
        }
        if (summary != null && !summary.isBlank()) {
            step.setLatestMessage(limit(summary));
            if (task != null) {
                task.setLatestSummary(limit(summary));
            }
        }
        return appendEvent(task, run, step, "step_finished", "system", payloadBuilder()
                .put("summary", defaultString(summary))
                .put("progressPercent", defaultProgress(step.getProgressPercent()))
                .put("currentCommand", defaultString(step.getCurrentCommand()))
        );
    }

    /**
     * runner 批量事件回调入口。
     * 事件字段统一映射为平台协议，避免 Python 与前端直接耦合。
     */
    @Transactional
    public void recordRunnerEvents(ExecutionTaskEntity task,
                                   ExecutionRunEntity run,
                                   ExecutionStepEntity step,
                                   List<ExecutionSessionEventRequest> events) {
        if (events == null || events.isEmpty()) {
            return;
        }
        for (ExecutionSessionEventRequest event : events) {
            if (event == null) {
                continue;
            }
            String eventType = defaultString(event.eventType()).trim();
            if (eventType.isBlank()) {
                continue;
            }
            switch (eventType) {
                case "command_started" -> recordCommandStarted(task, run, step, event.currentCommand());
                case "stdout_chunk" -> recordTextChunk(task, run, step, "stdout", event.text());
                case "stderr_chunk" -> recordTextChunk(task, run, step, "stderr", event.text());
                case "heartbeat" -> recordHeartbeat(task, run, step, event.summary());
                case "progress_changed" -> recordProgress(task, run, step, event.progressPercent(), event.summary());
                case "artifact_ready" -> appendEvent(task, run, step, "artifact_ready", "system", payloadBuilder()
                        .put("artifactId", event.artifactId() == null ? 0L : event.artifactId())
                        .put("summary", defaultString(event.summary())));
                case "step_summary_updated" -> recordSummary(task, run, step, event.summary());
                case "step_started" -> recordStepStarted(task, run, step, event.summary());
                case "step_finished" -> recordStepFinished(task, run, step, event.summary());
                default -> appendEvent(task, run, step, eventType, event.streamKind(), payloadBuilder()
                        .put("text", defaultString(event.text()))
                        .put("summary", defaultString(event.summary()))
                        .put("currentCommand", defaultString(event.currentCommand()))
                        .put("progressPercent", event.progressPercent() == null ? defaultProgress(step.getProgressPercent()) : event.progressPercent())
                        .put("artifactId", event.artifactId() == null ? 0L : event.artifactId()));
            }
        }
    }

    public List<ExecutionStreamEvent> listRunEvents(Long runId, Long afterId) {
        long cursor = afterId == null ? 0L : Math.max(afterId, 0L);
        return executionStepEventRepository.findAllByRun_IdAndSequenceNoGreaterThanOrderBySequenceNoAsc(runId, cursor).stream()
                .map(this::toStreamEvent)
                .toList();
    }

    public Long latestRunEventId(Long runId) {
        return executionStepEventRepository.findFirstByRun_IdOrderBySequenceNoDesc(runId)
                .map(ExecutionStepEventEntity::getSequenceNo)
                .orElse(null);
    }

    public StreamingResponseBody streamRunEvents(Long runId, Long afterId) {
        return outputStream -> {
            long cursor = afterId == null ? 0L : Math.max(afterId, 0L);
            int idleRounds = 0;
            while (true) {
                List<ExecutionStreamEvent> events = listRunEvents(runId, cursor);
                if (!events.isEmpty()) {
                    for (ExecutionStreamEvent event : events) {
                        writeEvent(outputStream, event);
                        cursor = event.id() == null ? cursor : event.id();
                    }
                    idleRounds = 0;
                } else {
                    idleRounds += 1;
                    // 执行详情页依赖这里的轮询把数据库中的增量事件尽快推到浏览器，
                    // 轮询间隔过大时，runner 已经写入的尾日志也会看起来像“结束后才一起出现”。
                    if (idleRounds % STREAM_PING_IDLE_ROUNDS == 0) {
                        writeComment(outputStream, "ping");
                    }
                }
                outputStream.flush();
                ExecutionRunEntity run = executionRunRepository.findById(runId).orElse(null);
                if (run == null || isTerminal(run.getStatus())) {
                    if (events.isEmpty()) {
                        break;
                    }
                }
                sleepQuietly(STREAM_POLL_INTERVAL_MILLIS);
            }
        };
    }

    public synchronized ExecutionStreamEvent appendEvent(ExecutionTaskEntity task,
                                                         ExecutionRunEntity run,
                                                         ExecutionStepEntity step,
                                                         String eventType,
                                                         String streamKind,
                                                         ObjectNode payload) {
        ExecutionRunEntity lockedRun = executionRunRepository.findByIdForUpdate(run.getId())
                .orElseThrow(() -> new IllegalStateException("执行运行不存在: " + run.getId()));
        Long nextSequence = executionStepEventRepository.findFirstByRun_IdOrderBySequenceNoDesc(lockedRun.getId())
                .map(item -> item.getSequenceNo() + 1)
                .orElse(1L);
        LocalDateTime now = LocalDateTime.now();
        ExecutionStepEntity writableStep = resolveWritableStep(step);

        ExecutionStepEventEntity entity = new ExecutionStepEventEntity();
        entity.setRun(lockedRun);
        entity.setStep(writableStep);
        entity.setSequenceNo(nextSequence);
        entity.setEventType(defaultString(eventType));
        entity.setStreamKind(trimToNull(streamKind));
        entity.setPayloadJson(payload == null ? "{}" : payload.toString());
        executionStepEventRepository.save(entity);

        if (writableStep != null) {
            mergeRuntimeStepState(writableStep, step, nextSequence, now);
            executionStepRepository.save(writableStep);
            syncRuntimeStepState(step, writableStep);
        }

        lockedRun.setUpdatedAt(now);
        executionRunRepository.save(lockedRun);

        if (task != null) {
            task.setUpdatedAt(now);
            executionTaskRepository.save(task);
        }
        return toStreamEvent(entity);
    }

    /**
     * runner 的迟到事件可能在 /complete 之后才到达。
     * 这里必须基于数据库当前版本更新运行态字段，避免把已经 SUCCESS/FAILED/CANCELED 的步骤又覆写回旧状态。
     */
    private ExecutionStepEntity resolveWritableStep(ExecutionStepEntity step) {
        if (step == null || step.getId() == null) {
            return step;
        }
        return executionStepRepository.findById(step.getId()).orElse(step);
    }

    private void mergeRuntimeStepState(ExecutionStepEntity target,
                                       ExecutionStepEntity source,
                                       Long nextSequence,
                                       LocalDateTime now) {
        if (target == null) {
            return;
        }
        if (source != null) {
            target.setCurrentCommand(defaultString(source.getCurrentCommand()));
            target.setLatestMessage(defaultString(source.getLatestMessage()));
            target.setProgressPercent(source.getProgressPercent());
            if (source.getLastHeartbeatAt() != null) {
                target.setLastHeartbeatAt(source.getLastHeartbeatAt());
            }
            target.setTailLogText(source.getTailLogText());
            target.setTailLogLineCount(source.getTailLogLineCount());
        }
        target.setLastEventId(nextSequence);
        target.setLastEventAt(now);
        target.setHasLiveStream(true);
    }

    private void syncRuntimeStepState(ExecutionStepEntity staleStep, ExecutionStepEntity persistedStep) {
        if (staleStep == null || persistedStep == null || staleStep == persistedStep) {
            return;
        }
        staleStep.setCurrentCommand(persistedStep.getCurrentCommand());
        staleStep.setLatestMessage(persistedStep.getLatestMessage());
        staleStep.setProgressPercent(persistedStep.getProgressPercent());
        staleStep.setLastHeartbeatAt(persistedStep.getLastHeartbeatAt());
        staleStep.setTailLogText(persistedStep.getTailLogText());
        staleStep.setTailLogLineCount(persistedStep.getTailLogLineCount());
        staleStep.setLastEventId(persistedStep.getLastEventId());
        staleStep.setLastEventAt(persistedStep.getLastEventAt());
        staleStep.setHasLiveStream(persistedStep.isHasLiveStream());
    }

    private void writeEvent(OutputStream outputStream, ExecutionStreamEvent event) throws IOException {
        outputStream.write(("event: execution-step-event\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(("id: " + defaultString(event.id()) + "\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(("data: " + objectMapper.writeValueAsString(event) + "\n\n").getBytes(StandardCharsets.UTF_8));
    }

    private void writeComment(OutputStream outputStream, String comment) throws IOException {
        outputStream.write((":" + defaultString(comment) + "\n\n").getBytes(StandardCharsets.UTF_8));
    }

    private ExecutionStreamEvent toStreamEvent(ExecutionStepEventEntity entity) {
        JsonNode payload = readPayload(entity.getPayloadJson());
        return new ExecutionStreamEvent(
                entity.getSequenceNo(),
                entity.getRun() == null ? null : entity.getRun().getId(),
                entity.getStep() == null ? null : entity.getStep().getId(),
                entity.getStep() == null ? null : entity.getStep().getStepNo(),
                entity.getStep() == null ? null : entity.getStep().getStepName(),
                entity.getEventType(),
                entity.getStreamKind(),
                textValue(payload, "text"),
                textValue(payload, "currentCommand"),
                intValue(payload, "progressPercent"),
                textValue(payload, "summary"),
                longValue(payload, "artifactId"),
                formatTime(entity.getCreatedAt())
        );
    }

    private JsonNode readPayload(String payloadJson) {
        try {
            return objectMapper.readTree(defaultString(payloadJson));
        } catch (Exception ignored) {
            return objectMapper.createObjectNode();
        }
    }

    private void appendTailLog(ExecutionStepEntity step, String text) {
        String normalized = defaultString(text).replace("\r", "");
        if (normalized.isBlank()) {
            return;
        }
        List<String> lines = new ArrayList<>();
        String existing = defaultString(step.getTailLogText()).replace("\r", "");
        if (!existing.isBlank()) {
            lines.addAll(List.of(existing.split("\n")));
        }
        for (String line : normalized.split("\n")) {
            if (!line.isBlank()) {
                lines.add(line);
            }
        }
        List<String> compacted = compactAdjacentDuplicates(lines);
        while (compacted.size() > MAX_TAIL_LINES) {
            compacted.remove(0);
        }
        String tail = String.join("\n", compacted);
        while (tail.length() > MAX_TAIL_CHARS && compacted.size() > 1) {
            compacted.remove(0);
            tail = String.join("\n", compacted);
        }
        step.setTailLogText(tail);
        step.setTailLogLineCount(compacted.size());
    }

    private List<String> compactAdjacentDuplicates(List<String> rawLines) {
        List<String> result = new ArrayList<>();
        String previous = null;
        int count = 0;
        for (String rawLine : rawLines) {
            String line = defaultString(rawLine);
            if (previous == null) {
                previous = line;
                count = 1;
                continue;
            }
            if (Objects.equals(previous, line)) {
                count += 1;
                continue;
            }
            result.add(formatRepeatedLine(previous, count));
            previous = line;
            count = 1;
        }
        if (previous != null) {
            result.add(formatRepeatedLine(previous, count));
        }
        return result;
    }

    private String formatRepeatedLine(String line, int count) {
        if (count <= 1) {
            return line;
        }
        return line + " [重复 " + count + " 次]";
    }

    private boolean isTerminal(String status) {
        return "SUCCESS".equalsIgnoreCase(defaultString(status))
                || "FAILED".equalsIgnoreCase(defaultString(status))
                || "CANCELED".equalsIgnoreCase(defaultString(status));
    }

    private void sleepQuietly(long millis) {
        try {
            TimeUnit.MILLISECONDS.sleep(millis);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private String defaultString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : TIME_FORMATTER.format(time);
    }

    private int defaultProgress(Integer progressPercent) {
        return progressPercent == null ? 0 : progressPercent;
    }

    private String limit(String value) {
        String normalized = defaultString(value).trim();
        if (normalized.length() <= 1000) {
            return normalized;
        }
        return normalized.substring(0, 1000);
    }

    private String trimToNull(String value) {
        String normalized = defaultString(value).trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private ObjectNode payloadBuilder() {
        return objectMapper.createObjectNode();
    }

    private String textValue(JsonNode payload, String fieldName) {
        if (payload == null || !payload.hasNonNull(fieldName)) {
            return null;
        }
        String value = payload.get(fieldName).asText("");
        return value.isBlank() ? null : value;
    }

    private Integer intValue(JsonNode payload, String fieldName) {
        if (payload == null || !payload.has(fieldName) || payload.get(fieldName).isNull()) {
            return null;
        }
        return payload.get(fieldName).asInt();
    }

    private Long longValue(JsonNode payload, String fieldName) {
        if (payload == null || !payload.has(fieldName) || payload.get(fieldName).isNull()) {
            return null;
        }
        long value = payload.get(fieldName).asLong();
        return value <= 0 ? null : value;
    }
}
