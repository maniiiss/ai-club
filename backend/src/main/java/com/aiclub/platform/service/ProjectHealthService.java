package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectHealthSnapshotEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.dto.ObservabilityHealthTimelinePoint;
import com.aiclub.platform.dto.ObservabilityProjectHealthSummary;
import com.aiclub.platform.dto.ObservabilityRuntimeInstanceHealthSummary;
import com.aiclub.platform.repository.ProjectHealthSnapshotRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 项目健康探测与查询服务。
 */
@Service
public class ProjectHealthService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;
    private final ProjectHealthSnapshotRepository projectHealthSnapshotRepository;
    private final ProjectRepository projectRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ProjectHealthScorer projectHealthScorer;
    private final ObservabilityProperties observabilityProperties;
    private final HttpClient httpClient;

    public ProjectHealthService(ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository,
                                ProjectHealthSnapshotRepository projectHealthSnapshotRepository,
                                ProjectRepository projectRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                ProjectHealthScorer projectHealthScorer,
                                ObservabilityProperties observabilityProperties) {
        this.projectRuntimeInstanceRepository = projectRuntimeInstanceRepository;
        this.projectHealthSnapshotRepository = projectHealthSnapshotRepository;
        this.projectRepository = projectRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.projectHealthScorer = projectHealthScorer;
        this.observabilityProperties = observabilityProperties;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofMillis(observabilityProperties.getHttpConnectTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /**
     * 对单个运行实例执行健康探测并写入快照。
     */
    @Transactional
    public void probeRuntimeInstance(ProjectRuntimeInstanceEntity runtimeInstance) {
        if (runtimeInstance == null || !Boolean.TRUE.equals(runtimeInstance.getEnabled()) || !Boolean.TRUE.equals(runtimeInstance.getHealthEnabled())) {
            return;
        }
        String probeType = defaultString(runtimeInstance.getHealthProbeType(), ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP);
        String probeTarget = defaultString(runtimeInstance.getHealthTarget());
        ProbeResult probeResult = ProjectRuntimeInstanceEntity.HEALTH_PROBE_TCP.equalsIgnoreCase(probeType)
                ? probeTcp(probeTarget)
                : probeHttp(probeTarget);
        ProjectHealthScorer.HealthScoreResult scoreResult = projectHealthScorer.score(probeResult.available(), probeResult.latencyMs());

        ProjectHealthSnapshotEntity snapshot = new ProjectHealthSnapshotEntity();
        snapshot.setProject(runtimeInstance.getProject());
        snapshot.setRuntimeInstance(runtimeInstance);
        snapshot.setProbeType(probeType.toUpperCase());
        snapshot.setProbeTarget(probeTarget);
        snapshot.setAvailabilityStatus(probeResult.available()
                ? ProjectHealthSnapshotEntity.AVAILABILITY_UP
                : ProjectHealthSnapshotEntity.AVAILABILITY_DOWN);
        snapshot.setHttpStatus(probeResult.httpStatus());
        snapshot.setLatencyMs(probeResult.latencyMs());
        snapshot.setHealthScore(scoreResult.score());
        snapshot.setHealthLevel(scoreResult.level());
        snapshot.setFailureReason(limit(probeResult.message(), 500));
        snapshot.setSampledAt(LocalDateTime.now());
        projectHealthSnapshotRepository.save(snapshot);

        runtimeInstance.setLastHealthCheckedAt(snapshot.getSampledAt());
        runtimeInstance.setLastHealthScore(scoreResult.score());
        runtimeInstance.setLastHealthLevel(scoreResult.level());
        runtimeInstance.setLastHealthMessage(limit(probeResult.message(), 500));
        runtimeInstance.setLastHealthLatencyMs(probeResult.latencyMs());
        projectRuntimeInstanceRepository.save(runtimeInstance);
    }

    /**
     * 读取项目当前健康概览。
     */
    @Transactional(readOnly = true)
    public ObservabilityProjectHealthSummary getProjectHealth(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        List<ProjectRuntimeInstanceEntity> instances = projectRuntimeInstanceRepository.findAllByProject_IdOrderByIdAsc(projectId);
        return buildProjectHealthSummary(project, instances);
    }

    /**
     * 查询项目或指定实例的健康趋势。
     */
    @Transactional(readOnly = true)
    public List<ObservabilityHealthTimelinePoint> getTimeline(Long projectId, Long runtimeInstanceId, int limit) {
        requireVisibleProject(projectId);
        int safeLimit = Math.max(1, Math.min(limit, 200));
        if (runtimeInstanceId != null) {
            List<ProjectHealthSnapshotEntity> snapshots = projectHealthSnapshotRepository
                    .findTop200ByProject_IdAndRuntimeInstance_IdOrderBySampledAtDescIdDesc(projectId, runtimeInstanceId);
            List<ObservabilityHealthTimelinePoint> points = new ArrayList<>();
            for (int i = Math.min(snapshots.size(), safeLimit) - 1; i >= 0; i--) {
                ProjectHealthSnapshotEntity snapshot = snapshots.get(i);
                points.add(new ObservabilityHealthTimelinePoint(
                        formatTime(snapshot.getSampledAt()),
                        snapshot.getHealthScore(),
                        snapshot.getHealthLevel()
                ));
            }
            return points;
        }
        List<ProjectHealthSnapshotEntity> snapshots = projectHealthSnapshotRepository.findTop200ByProject_IdOrderBySampledAtDescIdDesc(projectId);
        Map<String, TimelineAccumulator> grouped = new LinkedHashMap<>();
        for (ProjectHealthSnapshotEntity snapshot : snapshots) {
            String bucket = snapshot.getSampledAt().withSecond(0).withNano(0).format(TIME_FORMATTER);
            grouped.computeIfAbsent(bucket, key -> new TimelineAccumulator())
                    .merge(snapshot.getHealthScore(), snapshot.getHealthLevel());
            if (grouped.size() >= safeLimit) {
                break;
            }
        }
        List<ObservabilityHealthTimelinePoint> points = new ArrayList<>();
        List<Map.Entry<String, TimelineAccumulator>> entries = new ArrayList<>(grouped.entrySet());
        for (int i = entries.size() - 1; i >= 0; i--) {
            Map.Entry<String, TimelineAccumulator> entry = entries.get(i);
            points.add(new ObservabilityHealthTimelinePoint(
                    entry.getKey(),
                    entry.getValue().averageScore(),
                    entry.getValue().level()
            ));
        }
        return points;
    }

    /**
     * 删除过期健康快照。
     */
    @Transactional
    public void cleanupExpiredSnapshots() {
        projectHealthSnapshotRepository.deleteAllBySampledAtBefore(LocalDateTime.now().minusDays(observabilityProperties.getHealthRetentionDays()));
    }

    private ProbeResult probeHttp(String target) {
        long start = System.currentTimeMillis();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(target))
                    .timeout(Duration.ofMillis(observabilityProperties.getHttpReadTimeoutMs()))
                    .GET()
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            long latencyMs = System.currentTimeMillis() - start;
            boolean available = response.statusCode() >= 200 && response.statusCode() < 400;
            String message = available ? "HTTP " + response.statusCode() : "HTTP " + response.statusCode() + " 返回异常";
            return new ProbeResult(available, response.statusCode(), latencyMs, message);
        } catch (Exception exception) {
            return new ProbeResult(false, null, System.currentTimeMillis() - start, defaultString(exception.getMessage(), "HTTP 健康检查失败"));
        }
    }

    private ProbeResult probeTcp(String target) {
        long start = System.currentTimeMillis();
        String normalized = defaultString(target);
        try (java.net.Socket socket = new java.net.Socket()) {
            TcpTarget tcpTarget = parseTcpTarget(normalized);
            socket.connect(new InetSocketAddress(tcpTarget.host(), tcpTarget.port()), observabilityProperties.getHttpConnectTimeoutMs());
            long latencyMs = System.currentTimeMillis() - start;
            return new ProbeResult(true, null, latencyMs, "TCP 连接成功");
        } catch (Exception exception) {
            return new ProbeResult(false, null, System.currentTimeMillis() - start, defaultString(exception.getMessage(), "TCP 健康检查失败"));
        }
    }

    private TcpTarget parseTcpTarget(String target) {
        String normalized = target == null ? "" : target.trim();
        if (normalized.startsWith("tcp://")) {
            URI uri = URI.create(normalized);
            if (uri.getHost() == null || uri.getPort() <= 0) {
                throw new IllegalArgumentException("TCP 探针目标格式不正确");
            }
            return new TcpTarget(uri.getHost(), uri.getPort());
        }
        int separatorIndex = normalized.lastIndexOf(':');
        if (separatorIndex <= 0 || separatorIndex >= normalized.length() - 1) {
            throw new IllegalArgumentException("TCP 探针目标必须为 host:port");
        }
        String host = normalized.substring(0, separatorIndex).trim();
        int port = Integer.parseInt(normalized.substring(separatorIndex + 1).trim());
        return new TcpTarget(host, port);
    }

    private ObservabilityProjectHealthSummary buildProjectHealthSummary(ProjectEntity project,
                                                                       List<ProjectRuntimeInstanceEntity> instances) {
        List<ObservabilityRuntimeInstanceHealthSummary> items = new ArrayList<>();
        int enabledCount = 0;
        int abnormalCount = 0;
        int scoreSum = 0;
        int scoreCount = 0;
        String worstLevel = ProjectHealthScorer.LEVEL_UNKNOWN;
        LocalDateTime lastHealthCheckedAt = null;
        for (ProjectRuntimeInstanceEntity instance : instances) {
            if (Boolean.TRUE.equals(instance.getEnabled())) {
                enabledCount++;
            }
            if (ProjectHealthScorer.LEVEL_ABNORMAL.equalsIgnoreCase(instance.getLastHealthLevel())) {
                abnormalCount++;
            }
            if (instance.getLastHealthScore() != null && Boolean.TRUE.equals(instance.getEnabled())) {
                scoreSum += instance.getLastHealthScore();
                scoreCount++;
            }
            if (instance.getLastHealthCheckedAt() != null
                    && (lastHealthCheckedAt == null || instance.getLastHealthCheckedAt().isAfter(lastHealthCheckedAt))) {
                lastHealthCheckedAt = instance.getLastHealthCheckedAt();
            }
            worstLevel = projectHealthScorer.worseLevel(worstLevel, instance.getLastHealthLevel());
            items.add(new ObservabilityRuntimeInstanceHealthSummary(
                    instance.getId(),
                    instance.getName(),
                    instance.getEnvironment(),
                    instance.getServiceName(),
                    Boolean.TRUE.equals(instance.getEnabled()),
                    instance.getHealthProbeType(),
                    instance.getHealthTarget(),
                    instance.getLastHealthScore(),
                    instance.getLastHealthLevel(),
                    toAvailabilityStatus(instance.getLastHealthLevel()),
                    null,
                    instance.getLastHealthLatencyMs(),
                    instance.getLastHealthMessage(),
                    formatTime(instance.getLastHealthCheckedAt())
            ));
        }
        Integer projectHealthScore = scoreCount == 0 ? null : Math.round(scoreSum / (float) scoreCount);
        return new ObservabilityProjectHealthSummary(
                project.getId(),
                project.getName(),
                projectHealthScore,
                projectHealthScore == null ? ProjectHealthScorer.LEVEL_UNKNOWN : worstLevel,
                formatTime(lastHealthCheckedAt),
                instances.size(),
                enabledCount,
                abnormalCount,
                items
        );
    }

    private String toAvailabilityStatus(String level) {
        if (ProjectHealthScorer.LEVEL_HEALTHY.equalsIgnoreCase(level) || ProjectHealthScorer.LEVEL_DEGRADED.equalsIgnoreCase(level)) {
            return ProjectHealthSnapshotEntity.AVAILABILITY_UP;
        }
        if (ProjectHealthScorer.LEVEL_ABNORMAL.equalsIgnoreCase(level)) {
            return ProjectHealthSnapshotEntity.AVAILABILITY_DOWN;
        }
        return ProjectHealthScorer.LEVEL_UNKNOWN;
    }

    private ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : TIME_FORMATTER.format(value);
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String defaultString(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    /**
     * 单次探针结果。
     */
    private record ProbeResult(
            boolean available,
            Integer httpStatus,
            Long latencyMs,
            String message
    ) {
    }

    /**
     * TCP 目标地址。
     */
    private record TcpTarget(
            String host,
            int port
    ) {
    }

    /**
     * 项目级趋势聚合器。
     */
    private final class TimelineAccumulator {

        private int scoreSum;
        private int count;
        private String level = ProjectHealthScorer.LEVEL_UNKNOWN;

        private void merge(Integer score, String currentLevel) {
            if (score != null) {
                scoreSum += score;
                count++;
            }
            level = projectHealthScorer.worseLevel(level, currentLevel);
        }

        private int averageScore() {
            return count == 0 ? 0 : Math.round(scoreSum / (float) count);
        }

        private String level() {
            return level;
        }
    }
}
