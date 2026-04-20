package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.request.ExecutionSessionArtifactRequest;
import com.aiclub.platform.dto.request.ExecutionSessionCompleteRequest;
import com.aiclub.platform.dto.request.ExecutionSessionEventRequest;
import com.aiclub.platform.dto.request.ExecutionSessionEventsRequest;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.concurrent.TimeUnit;

/**
 * 执行步骤异步会话服务。
 * 负责绑定 runner session、消费事件回调、等待步骤终态以及 heartbeat/watchdog 超时处理。
 */
@Service
public class ExecutionAsyncSessionService {

    private static final int SUBMIT_TIMEOUT_SECONDS = 15;
    private static final int HEARTBEAT_TIMEOUT_SECONDS = 60;
    private static final int IDLE_TIMEOUT_SECONDS = 300;

    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionEventService executionEventService;

    public ExecutionAsyncSessionService(ExecutionStepRepository executionStepRepository,
                                        ExecutionRunRepository executionRunRepository,
                                        ExecutionTaskRepository executionTaskRepository,
                                        ExecutionArtifactRepository executionArtifactRepository,
                                        ExecutionEventService executionEventService) {
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionEventService = executionEventService;
    }

    @Transactional
    public void bindRunnerSession(ExecutionTaskEntity task,
                                  ExecutionRunEntity run,
                                  ExecutionStepEntity step,
                                  String sessionId,
                                  String runnerType) {
        step.setRunnerSessionId(sessionId);
        step.setRunnerType(defaultString(runnerType));
        step.setHasLiveStream(true);
        step.setLastHeartbeatAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordSummary(task, run, step, "已提交到 " + defaultString(runnerType).trim() + " runner");
    }

    @Transactional
    public void recordRunnerEvents(String sessionId, ExecutionSessionEventsRequest request) {
        ExecutionStepEntity step = requireStepBySessionId(sessionId);
        if (isTerminal(step.getStatus())) {
            return;
        }
        ExecutionRunEntity run = step.getRun();
        ExecutionTaskEntity task = run.getExecutionTask();
        List<ExecutionSessionEventRequest> events = request == null ? List.of() : request.events();
        if (!events.isEmpty()) {
            step.setLastHeartbeatAt(LocalDateTime.now());
            executionStepRepository.save(step);
        }
        executionEventService.recordRunnerEvents(task, run, step, events);
    }

    @Transactional
    public void completeRunnerSession(String sessionId, ExecutionSessionCompleteRequest request) {
        ExecutionStepEntity step = requireStepBySessionId(sessionId);
        if (isTerminal(step.getStatus())) {
            return;
        }
        ExecutionRunEntity run = step.getRun();
        ExecutionTaskEntity task = run.getExecutionTask();

        String normalizedStatus = normalizeStatus(request == null ? null : request.status());
        String outputSummary = request == null ? "" : defaultString(request.outputSummary()).trim();
        String errorMessage = request == null ? "" : defaultString(request.errorMessage()).trim();
        String outputSnapshot = request == null ? "" : defaultString(request.outputSnapshot());

        step.setStatus(normalizedStatus);
        step.setProgressPercent("SUCCESS".equals(normalizedStatus) ? 100 : step.getProgressPercent());
        step.setFinishedAt(LocalDateTime.now());
        step.setOutputSnapshot(outputSnapshot.isBlank() ? step.getOutputSnapshot() : outputSnapshot);
        step.setErrorMessage(errorMessage.isBlank() ? step.getErrorMessage() : limit(errorMessage, 4000));
        if (!outputSummary.isBlank()) {
            step.setLatestMessage(limit(outputSummary, 1000));
            task.setLatestSummary(limit(outputSummary, 1000));
            run.setOutputSummary(limit(outputSummary, 4000));
        }
        if (!errorMessage.isBlank()) {
            run.setErrorMessage(limit(errorMessage, 4000));
        }
        run.setUpdatedAt(LocalDateTime.now());
        task.setUpdatedAt(LocalDateTime.now());

        executionStepRepository.save(step);
        executionRunRepository.save(run);
        executionTaskRepository.save(task);

        if (request != null && request.artifacts() != null) {
            for (ExecutionSessionArtifactRequest artifactRequest : request.artifacts()) {
                if (artifactRequest == null || defaultString(artifactRequest.artifactType()).isBlank()) {
                    continue;
                }
                ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
                artifact.setRun(run);
                artifact.setStep(step);
                artifact.setArtifactType(defaultString(artifactRequest.artifactType()).trim());
                artifact.setTitle(limit(defaultString(artifactRequest.title()).trim(), 200));
                artifact.setContentRef(trimToNull(artifactRequest.contentRef()));
                artifact.setContentText(trimToNull(artifactRequest.contentText()));
                artifact.setWorkItemWritebackFlag(false);
                ExecutionArtifactEntity saved = executionArtifactRepository.save(artifact);
                executionEventService.recordArtifactReady(task, run, step, saved.getId(), saved.getTitle());
            }
        }
        executionEventService.recordStepFinished(task, run, step, !outputSummary.isBlank() ? outputSummary : errorMessage);
    }

    /**
     * 用户主动取消时，如果当前步骤仍在 live runner 中执行，则直接把它收敛到取消态，
     * 让等待线程尽快感知到终态，而不是继续阻塞到 runner 自己结束。
     */
    @Transactional
    public boolean cancelLiveStep(ExecutionTaskEntity task,
                                  ExecutionRunEntity run,
                                  ExecutionStepEntity step,
                                  String message) {
        if (task == null || run == null || step == null || isTerminal(step.getStatus())) {
            return false;
        }
        if (!step.isHasLiveStream() || !hasText(step.getRunnerSessionId())) {
            return false;
        }
        String normalizedMessage = limit(hasText(message) ? message : "执行任务已取消", 1000);
        LocalDateTime now = LocalDateTime.now();

        step.setStatus("CANCELED");
        step.setFinishedAt(now);
        step.setLatestMessage(normalizedMessage);
        step.setErrorMessage(limit(normalizedMessage, 4000));
        step.setProgressPercent(Math.max(step.getProgressPercent() == null ? 0 : step.getProgressPercent(), 1));

        run.setStatus("CANCELED");
        run.setOutputSummary(limit(normalizedMessage, 4000));
        run.setErrorMessage(limit(normalizedMessage, 4000));
        run.setFinishedAt(now);
        run.setUpdatedAt(now);

        task.setStatus("CANCELED");
        task.setCurrentRun(run);
        task.setLatestSummary(normalizedMessage);
        task.setUpdatedAt(now);

        executionStepRepository.save(step);
        executionRunRepository.save(run);
        executionTaskRepository.save(task);
        executionEventService.recordSummary(task, run, step, normalizedMessage);
        executionEventService.recordStepFinished(task, run, step, normalizedMessage);
        return true;
    }

    /**
     * 等待异步步骤终态。
     * worker 线程不会在这里解析日志，只关心步骤是否已经由 runner 回调为 SUCCESS/FAILED/CANCELED。
     */
    public ExecutionStepEntity awaitTerminalStep(Long stepId, int maxRuntimeSeconds) {
        long deadline = System.currentTimeMillis() + Math.max(maxRuntimeSeconds, 1) * 1000L;
        while (System.currentTimeMillis() < deadline) {
            ExecutionStepEntity current = executionStepRepository.findById(stepId)
                    .orElseThrow(() -> new NoSuchElementException("执行步骤不存在: " + stepId));
            if (isTerminal(current.getStatus())) {
                return current;
            }
            sleepQuietly(1000L);
        }
        throw new IllegalStateException("异步步骤等待超时，超过 " + maxRuntimeSeconds + " 秒");
    }

    /**
     * watchdog 周期性检查失联步骤。
     * 心跳超时优先，其次补空闲超时，最终把步骤和运行收敛到失败态。
     */
    @Transactional
    public void failTimedOutLiveSteps() {
        LocalDateTime now = LocalDateTime.now();
        for (ExecutionStepEntity step : executionStepRepository.findAllByStatusAndHasLiveStreamTrue("RUNNING")) {
            LocalDateTime heartbeatAt = step.getLastHeartbeatAt();
            LocalDateTime eventAt = step.getLastEventAt();
            if (heartbeatAt != null && heartbeatAt.plusSeconds(HEARTBEAT_TIMEOUT_SECONDS).isBefore(now)) {
                markTimedOut(step, "执行心跳超时，runner 可能已失联");
                continue;
            }
            if (eventAt != null && eventAt.plusSeconds(IDLE_TIMEOUT_SECONDS).isBefore(now)) {
                markTimedOut(step, "执行空闲超时，长时间未收到日志或状态更新");
            }
        }
    }

    public int submitTimeoutSeconds() {
        return SUBMIT_TIMEOUT_SECONDS;
    }

    public int maxRuntimeSeconds(String stepCode) {
        String normalized = defaultString(stepCode).trim().toUpperCase();
        return switch (normalized) {
            case "REPO_STRUCTURING" -> 900;
            case "IMPLEMENT" -> 3600;
            case "TEST" -> 2400;
            case "PLAN", "REPORT", "REVIEW", "TEST_DESIGN", "AD_HOC_RUN" -> 600;
            default -> 600;
        };
    }

    private void markTimedOut(ExecutionStepEntity step, String message) {
        ExecutionRunEntity run = step.getRun();
        ExecutionTaskEntity task = run.getExecutionTask();
        step.setStatus("FAILED");
        step.setFinishedAt(LocalDateTime.now());
        step.setErrorMessage(limit(message, 4000));
        step.setLatestMessage(limit(message, 1000));
        step.setProgressPercent(Math.max(step.getProgressPercent() == null ? 0 : step.getProgressPercent(), 1));
        run.setStatus("FAILED");
        run.setErrorMessage(limit(message, 4000));
        run.setFinishedAt(LocalDateTime.now());
        run.setUpdatedAt(LocalDateTime.now());
        task.setStatus("FAILED");
        task.setLatestSummary(limit(message, 1000));
        task.setUpdatedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionRunRepository.save(run);
        executionTaskRepository.save(task);
        executionEventService.recordSummary(task, run, step, message);
        executionEventService.recordStepFinished(task, run, step, message);
    }

    private ExecutionStepEntity requireStepBySessionId(String sessionId) {
        return executionStepRepository.findByRunnerSessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("执行步骤会话不存在: " + sessionId));
    }

    private boolean isTerminal(String status) {
        return "SUCCESS".equalsIgnoreCase(defaultString(status))
                || "FAILED".equalsIgnoreCase(defaultString(status))
                || "CANCELED".equalsIgnoreCase(defaultString(status));
    }

    private String normalizeStatus(String status) {
        String normalized = defaultString(status).trim().toUpperCase();
        return switch (normalized) {
            case "SUCCESS", "FAILED", "CANCELED" -> normalized;
            default -> "FAILED";
        };
    }

    private void sleepQuietly(long millis) {
        try {
            TimeUnit.MILLISECONDS.sleep(millis);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private boolean hasText(String value) {
        return !defaultString(value).trim().isEmpty();
    }

    private String trimToNull(String value) {
        String normalized = defaultString(value).trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value).trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }
}
