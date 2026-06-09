package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeLogEntity;
import com.aiclub.platform.dto.ObservabilityHealthTimelinePoint;
import com.aiclub.platform.dto.ObservabilityProjectDetail;
import com.aiclub.platform.dto.ObservabilityProjectHealthSummary;
import com.aiclub.platform.dto.ObservabilityProjectLogSummary;
import com.aiclub.platform.dto.ObservabilityProjectSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.request.ObservabilityRuntimeInstanceUpdateRequest;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import com.aiclub.platform.repository.ProjectRuntimeLogRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * 可观测性中心查询与配置编排服务。
 */
@Service
@Transactional(readOnly = true)
public class ObservabilityService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ProjectRepository projectRepository;
    private final ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;
    private final ProjectRuntimeLogRepository projectRuntimeLogRepository;
    private final ProjectRuntimeInstanceService projectRuntimeInstanceService;
    private final ProjectHealthService projectHealthService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ProjectHealthScorer projectHealthScorer;

    public ObservabilityService(ProjectRepository projectRepository,
                                ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository,
                                ProjectRuntimeLogRepository projectRuntimeLogRepository,
                                ProjectRuntimeInstanceService projectRuntimeInstanceService,
                                ProjectHealthService projectHealthService,
                                ProjectDataPermissionService projectDataPermissionService,
                                ProjectHealthScorer projectHealthScorer) {
        this.projectRepository = projectRepository;
        this.projectRuntimeInstanceRepository = projectRuntimeInstanceRepository;
        this.projectRuntimeLogRepository = projectRuntimeLogRepository;
        this.projectRuntimeInstanceService = projectRuntimeInstanceService;
        this.projectHealthService = projectHealthService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.projectHealthScorer = projectHealthScorer;
    }

    /**
     * 分页查询项目观测概览。
     */
    public PageResponse<ObservabilityProjectSummary> pageProjects(int page, int size, String keyword, String healthLevel) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        List<ProjectEntity> visibleProjects = projectRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .filter(project -> projectDataPermissionService.isProjectVisible(project, scope))
                .sorted(Comparator.comparing(ProjectEntity::getId))
                .toList();
        Map<Long, List<ProjectRuntimeInstanceEntity>> runtimeInstancesByProject = projectRuntimeInstanceRepository.findAll().stream()
                .collect(Collectors.groupingBy(entity -> entity.getProject().getId(), HashMap::new, Collectors.toList()));

        String normalizedKeyword = normalizeKeyword(keyword);
        String normalizedHealthLevel = normalizeHealthLevel(healthLevel);
        List<ObservabilityProjectSummary> summaries = new ArrayList<>();
        for (ProjectEntity project : visibleProjects) {
            if (normalizedKeyword != null && !containsProjectKeyword(project, normalizedKeyword)) {
                continue;
            }
            ObservabilityProjectSummary summary = buildProjectSummary(project, runtimeInstancesByProject.getOrDefault(project.getId(), List.of()));
            if (normalizedHealthLevel != null && !normalizedHealthLevel.equalsIgnoreCase(defaultString(summary.projectHealthLevel()))) {
                continue;
            }
            summaries.add(summary);
        }

        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        int fromIndex = Math.min((safePage - 1) * safeSize, summaries.size());
        int toIndex = Math.min(fromIndex + safeSize, summaries.size());
        int totalPages = summaries.isEmpty() ? 0 : (int) Math.ceil(summaries.size() / (double) safeSize);
        return new PageResponse<>(summaries.subList(fromIndex, toIndex), summaries.size(), safePage, safeSize, totalPages);
    }

    /**
     * 获取项目观测详情。
     */
    public ObservabilityProjectDetail getProjectDetail(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        List<ProjectRuntimeInstanceEntity> runtimeInstances = projectRuntimeInstanceRepository.findAllByProject_IdOrderByIdAsc(projectId);
        return new ObservabilityProjectDetail(
                buildProjectSummary(project, runtimeInstances),
                projectRuntimeInstanceService.listByProject(projectId)
        );
    }

    /**
     * 分页查询项目运行日志。
     */
    public PageResponse<ObservabilityProjectLogSummary> pageProjectLogs(Long projectId,
                                                                        int page,
                                                                        int size,
                                                                        Long runtimeInstanceId,
                                                                        String level,
                                                                        String keyword,
                                                                        String traceId,
                                                                        String startTime,
                                                                        String endTime) {
        requireVisibleProject(projectId);
        Pageable pageable = PageRequest.of(Math.max(page, 1) - 1, Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "loggedAt", "id"));
        Page<ObservabilityProjectLogSummary> pageData = projectRuntimeLogRepository.findAll(
                        buildLogSpecification(projectId, runtimeInstanceId, level, keyword, traceId, startTime, endTime),
                        pageable
                )
                .map(this::toProjectLogSummary);
        return PageResponse.from(pageData);
    }

    /**
     * 获取项目健康摘要。
     */
    public ObservabilityProjectHealthSummary getProjectHealth(Long projectId) {
        return projectHealthService.getProjectHealth(projectId);
    }

    /**
     * 获取项目或运行实例的健康趋势。
     */
    public List<ObservabilityHealthTimelinePoint> getProjectHealthTimeline(Long projectId, Long runtimeInstanceId, int limit) {
        return projectHealthService.getTimeline(projectId, runtimeInstanceId, limit);
    }

    /**
     * 更新运行实例的观测配置。
     */
    @Transactional
    public ProjectRuntimeInstanceSummary updateRuntimeInstance(Long projectId,
                                                              Long runtimeInstanceId,
                                                              ObservabilityRuntimeInstanceUpdateRequest request) {
        ProjectEntity project = requireVisibleProject(projectId);
        projectDataPermissionService.requireProjectEditable(project);
        return projectRuntimeInstanceService.updateFromObservability(projectId, runtimeInstanceId, request);
    }

    private ObservabilityProjectSummary buildProjectSummary(ProjectEntity project, List<ProjectRuntimeInstanceEntity> runtimeInstances) {
        int enabledCount = 0;
        int abnormalCount = 0;
        Integer scoreSum = 0;
        int scoreCount = 0;
        String worstLevel = ProjectHealthScorer.LEVEL_UNKNOWN;
        LocalDateTime lastHealthCheckedAt = null;
        LocalDateTime lastLogCollectedAt = null;
        String lastLogCollectStatus = null;
        String lastLogCollectMessage = null;
        for (ProjectRuntimeInstanceEntity runtimeInstance : runtimeInstances) {
            if (Boolean.TRUE.equals(runtimeInstance.getEnabled())) {
                enabledCount++;
            }
            if (ProjectHealthScorer.LEVEL_ABNORMAL.equalsIgnoreCase(runtimeInstance.getLastHealthLevel())) {
                abnormalCount++;
            }
            if (runtimeInstance.getLastHealthScore() != null && Boolean.TRUE.equals(runtimeInstance.getEnabled())) {
                scoreSum += runtimeInstance.getLastHealthScore();
                scoreCount++;
            }
            if (runtimeInstance.getLastHealthCheckedAt() != null
                    && (lastHealthCheckedAt == null || runtimeInstance.getLastHealthCheckedAt().isAfter(lastHealthCheckedAt))) {
                lastHealthCheckedAt = runtimeInstance.getLastHealthCheckedAt();
            }
            if (runtimeInstance.getLastLogCollectedAt() != null
                    && (lastLogCollectedAt == null || runtimeInstance.getLastLogCollectedAt().isAfter(lastLogCollectedAt))) {
                lastLogCollectedAt = runtimeInstance.getLastLogCollectedAt();
                lastLogCollectStatus = runtimeInstance.getLastLogCollectStatus();
                lastLogCollectMessage = runtimeInstance.getLastLogCollectMessage();
            }
            worstLevel = projectHealthScorer.worseLevel(worstLevel, runtimeInstance.getLastHealthLevel());
        }
        Integer projectHealthScore = scoreCount == 0 ? null : Math.round(scoreSum / (float) scoreCount);
        return new ObservabilityProjectSummary(
                project.getId(),
                project.getName(),
                project.getStatus(),
                runtimeInstances.size(),
                enabledCount,
                abnormalCount,
                projectHealthScore,
                projectHealthScore == null ? ProjectHealthScorer.LEVEL_UNKNOWN : worstLevel,
                formatTime(lastHealthCheckedAt),
                formatTime(lastLogCollectedAt),
                lastLogCollectStatus,
                lastLogCollectMessage
        );
    }

    private Specification<ProjectRuntimeLogEntity> buildLogSpecification(Long projectId,
                                                                         Long runtimeInstanceId,
                                                                         String level,
                                                                         String keyword,
                                                                         String traceId,
                                                                         String startTime,
                                                                         String endTime) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("project").get("id"), projectId));
            if (runtimeInstanceId != null) {
                predicates.add(cb.equal(root.get("runtimeInstance").get("id"), runtimeInstanceId));
            }
            if (level != null && !level.isBlank()) {
                predicates.add(cb.equal(cb.upper(root.get("logLevel")), level.trim().toUpperCase(Locale.ROOT)));
            }
            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("message")), pattern),
                        cb.like(cb.lower(root.get("raw")), pattern),
                        cb.like(cb.lower(root.get("logger")), pattern),
                        cb.like(cb.lower(root.get("sourcePath")), pattern)
                ));
            }
            if (traceId != null && !traceId.isBlank()) {
                predicates.add(cb.equal(root.get("traceId"), traceId.trim()));
            }
            LocalDateTime start = parseQueryTime(startTime);
            if (start != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("loggedAt"), start));
            }
            LocalDateTime end = parseQueryTime(endTime);
            if (end != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("loggedAt"), end));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private ObservabilityProjectLogSummary toProjectLogSummary(ProjectRuntimeLogEntity entity) {
        return new ObservabilityProjectLogSummary(
                entity.getId(),
                entity.getRuntimeInstance().getId(),
                entity.getRuntimeInstance().getName(),
                entity.getSourceType(),
                entity.getSourcePath(),
                entity.getLogLevel(),
                entity.getLogger(),
                entity.getTraceId(),
                entity.getMessage(),
                entity.getRaw(),
                formatTime(entity.getLoggedAt()),
                formatTime(entity.getCollectedAt())
        );
    }

    private ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private boolean containsProjectKeyword(ProjectEntity project, String normalizedKeyword) {
        return defaultString(project.getName()).toLowerCase(Locale.ROOT).contains(normalizedKeyword)
                || defaultString(project.getStatus()).toLowerCase(Locale.ROOT).contains(normalizedKeyword)
                || defaultString(project.getOwner()).toLowerCase(Locale.ROOT).contains(normalizedKeyword)
                || defaultString(project.getDescription()).toLowerCase(Locale.ROOT).contains(normalizedKeyword);
    }

    private String normalizeKeyword(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return null;
        }
        return keyword.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeHealthLevel(String healthLevel) {
        if (healthLevel == null || healthLevel.trim().isEmpty()) {
            return null;
        }
        return healthLevel.trim().toUpperCase(Locale.ROOT);
    }

    private LocalDateTime parseQueryTime(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        String normalized = value.trim();
        for (DateTimeFormatter formatter : List.of(DateTimeFormatter.ISO_LOCAL_DATE_TIME, TIME_FORMATTER)) {
            try {
                return LocalDateTime.parse(normalized, formatter);
            } catch (DateTimeParseException ignored) {
                // 继续尝试下一个格式。
            }
        }
        return null;
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : TIME_FORMATTER.format(value);
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
