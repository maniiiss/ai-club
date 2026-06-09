package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.request.ProjectRuntimeInstanceRequest;
import com.aiclub.platform.dto.request.ObservabilityRuntimeInstanceUpdateRequest;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import com.aiclub.platform.repository.ServerInfoRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;

/**
 * 项目运行实例服务，统一维护可观测性日志采集和健康检查的目标清单。
 */
@Service
@Transactional(readOnly = true)
public class ProjectRuntimeInstanceService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_LOG_PATHS = 20;

    private final ProjectRuntimeInstanceRepository runtimeInstanceRepository;
    private final ProjectRepository projectRepository;
    private final ServerInfoRepository serverInfoRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ObjectMapper objectMapper;

    public ProjectRuntimeInstanceService(ProjectRuntimeInstanceRepository runtimeInstanceRepository,
                                         ProjectRepository projectRepository,
                                         ServerInfoRepository serverInfoRepository,
                                         ProjectDataPermissionService projectDataPermissionService,
                                         ObjectMapper objectMapper) {
        this.runtimeInstanceRepository = runtimeInstanceRepository;
        this.projectRepository = projectRepository;
        this.serverInfoRepository = serverInfoRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.objectMapper = objectMapper;
    }

    public List<ProjectRuntimeInstanceSummary> listByProject(Long projectId) {
        ProjectEntity project = requireProject(projectId);
        projectDataPermissionService.requireProjectVisible(project);
        return runtimeInstanceRepository.findAllByProject_IdOrderByIdAsc(projectId).stream()
                .map(this::toSummary)
                .toList();
    }

    public List<ProjectRuntimeInstanceSummary> listByJenkinsBinding(ProjectPipelineBindingEntity binding) {
        projectDataPermissionService.requireProjectVisible(binding.getProject());
        return runtimeInstanceRepository.findAllBySourceTypeAndSourceBindingIdOrderByIdAsc(
                        ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS,
                        binding.getId()
                ).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public ProjectRuntimeInstanceSummary createManual(Long projectId, ProjectRuntimeInstanceRequest request) {
        ProjectEntity project = requireProject(projectId);
        projectDataPermissionService.requireProjectVisible(project);
        ProjectRuntimeInstanceEntity entity = new ProjectRuntimeInstanceEntity();
        entity.setProject(project);
        entity.setSourceType(ProjectRuntimeInstanceEntity.SOURCE_TYPE_MANUAL);
        fillEntity(entity, request);
        return toSummary(runtimeInstanceRepository.save(entity));
    }

    @Transactional
    public ProjectRuntimeInstanceSummary update(Long projectId, Long id, ProjectRuntimeInstanceRequest request) {
        ProjectRuntimeInstanceEntity entity = runtimeInstanceRepository.findByIdAndProject_Id(id, projectId)
                .orElseThrow(() -> new NoSuchElementException("项目运行实例不存在"));
        projectDataPermissionService.requireProjectVisible(entity.getProject());
        fillEntity(entity, request);
        return toSummary(runtimeInstanceRepository.save(entity));
    }

    /**
     * 可观测性中心更新运行实例配置。
     * 目前沿用运行实例的统一校验规则，只更新实例本身，不改动 Jenkins 绑定主记录。
     */
    @Transactional
    public ProjectRuntimeInstanceSummary updateFromObservability(Long projectId,
                                                                Long id,
                                                                ObservabilityRuntimeInstanceUpdateRequest request) {
        return update(projectId, id, new ProjectRuntimeInstanceRequest(
                request.name(),
                request.environment(),
                request.serviceName(),
                request.enabled(),
                request.serverMode(),
                request.serverId(),
                request.externalBaseUrl(),
                request.logEnabled(),
                request.logPaths(),
                request.healthEnabled(),
                request.healthProbeType(),
                request.healthTarget()
        ));
    }

    @Transactional
    public void delete(Long projectId, Long id) {
        ProjectRuntimeInstanceEntity entity = runtimeInstanceRepository.findByIdAndProject_Id(id, projectId)
                .orElseThrow(() -> new NoSuchElementException("项目运行实例不存在"));
        projectDataPermissionService.requireProjectVisible(entity.getProject());
        runtimeInstanceRepository.delete(entity);
    }

    @Transactional
    public void syncJenkinsRuntimeInstances(ProjectPipelineBindingEntity binding, List<ProjectRuntimeInstanceRequest> requests) {
        runtimeInstanceRepository.deleteAllBySourceTypeAndSourceBindingId(ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS, binding.getId());
        if (requests == null || requests.isEmpty()) {
            return;
        }
        for (ProjectRuntimeInstanceRequest request : requests) {
            ProjectRuntimeInstanceEntity entity = new ProjectRuntimeInstanceEntity();
            entity.setProject(binding.getProject());
            entity.setSourceType(ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS);
            entity.setSourceBindingId(binding.getId());
            fillEntity(entity, request);
            runtimeInstanceRepository.save(entity);
        }
    }

    @Transactional
    public void deleteJenkinsRuntimeInstances(ProjectPipelineBindingEntity binding) {
        runtimeInstanceRepository.deleteAllBySourceTypeAndSourceBindingId(ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS, binding.getId());
    }

    @Transactional
    public void markJenkinsRuntimeInstancesDeploying(ProjectPipelineBindingEntity binding, String message) {
        List<ProjectRuntimeInstanceEntity> enabledInstances = runtimeInstanceRepository
                .findAllBySourceTypeAndSourceBindingIdOrderByIdAsc(ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS, binding.getId())
                .stream()
                .filter(entity -> Boolean.TRUE.equals(entity.getEnabled()))
                .toList();
        if (enabledInstances.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        for (ProjectRuntimeInstanceEntity entity : enabledInstances) {
            entity.setLastStatus(ProjectRuntimeInstanceEntity.STATUS_DEPLOYING);
            entity.setLastStatusMessage(limit(defaultString(message), 500));
            entity.setLastDeployedAt(now);
        }
        runtimeInstanceRepository.saveAll(enabledInstances);
    }

    private void fillEntity(ProjectRuntimeInstanceEntity entity, ProjectRuntimeInstanceRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("项目运行实例配置不能为空");
        }
        entity.setName(requireText(request.name(), "运行实例名称不能为空", 120));
        entity.setEnvironment(limit(trimToNull(request.environment()), 60));
        entity.setServiceName(limit(trimToNull(request.serviceName()), 120));
        entity.setEnabled(request.enabled() == null || Boolean.TRUE.equals(request.enabled()));

        String serverMode = normalizeServerMode(request.serverMode());
        entity.setServerMode(serverMode);
        if (ProjectRuntimeInstanceEntity.SERVER_MODE_MANAGED_SERVER.equals(serverMode)) {
            if (request.serverId() == null) {
                throw new IllegalArgumentException("受管服务器实例必须选择服务器");
            }
            ServerInfoEntity server = serverInfoRepository.findById(request.serverId())
                    .orElseThrow(() -> new NoSuchElementException("服务器不存在"));
            entity.setServer(server);
            entity.setExternalBaseUrl(null);
        } else {
            entity.setServer(null);
            entity.setExternalBaseUrl(normalizeHttpUrl(request.externalBaseUrl(), "外部访问地址必须是 http 或 https 地址"));
        }

        boolean logEnabled = Boolean.TRUE.equals(request.logEnabled());
        if (ProjectRuntimeInstanceEntity.SERVER_MODE_EXTERNAL_ENDPOINT.equals(serverMode) && logEnabled) {
            throw new IllegalArgumentException("外部地址实例不支持 SSH 日志采集");
        }
        entity.setLogEnabled(logEnabled);
        entity.setLogPathsJson(toJson(normalizeLogPaths(request.logPaths())));

        boolean healthEnabled = request.healthEnabled() == null || Boolean.TRUE.equals(request.healthEnabled());
        entity.setHealthEnabled(healthEnabled);
        entity.setHealthProbeType(healthEnabled ? normalizeHealthProbeType(request.healthProbeType()) : null);
        entity.setHealthTarget(healthEnabled ? requireText(request.healthTarget(), "健康检查目标不能为空", 500) : null);
    }

    private ProjectEntity requireProject(Long projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
    }

    private String normalizeServerMode(String value) {
        String normalized = requireText(value, "服务器模式不能为空", 30).toUpperCase(Locale.ROOT);
        if (!ProjectRuntimeInstanceEntity.SERVER_MODE_MANAGED_SERVER.equals(normalized)
                && !ProjectRuntimeInstanceEntity.SERVER_MODE_EXTERNAL_ENDPOINT.equals(normalized)) {
            throw new IllegalArgumentException("服务器模式仅支持 MANAGED_SERVER 或 EXTERNAL_ENDPOINT");
        }
        return normalized;
    }

    private String normalizeHealthProbeType(String value) {
        String normalized = trimToNull(value) == null
                ? ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP
                : value.trim().toUpperCase(Locale.ROOT);
        if (!ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP.equals(normalized)
                && !ProjectRuntimeInstanceEntity.HEALTH_PROBE_TCP.equals(normalized)) {
            throw new IllegalArgumentException("健康探针类型仅支持 HTTP 或 TCP");
        }
        return normalized;
    }

    private List<String> normalizeLogPaths(List<String> logPaths) {
        if (logPaths == null || logPaths.isEmpty()) {
            return List.of();
        }
        List<String> normalized = new ArrayList<>();
        for (String rawPath : logPaths) {
            String path = trimToNull(rawPath);
            if (path == null) {
                continue;
            }
            if (!path.startsWith("/") && !path.startsWith("~/")) {
                throw new IllegalArgumentException("日志路径必须是绝对路径或 ~/ 开头路径");
            }
            normalized.add(limit(path, 500));
            if (normalized.size() > MAX_LOG_PATHS) {
                throw new IllegalArgumentException("日志路径最多配置 " + MAX_LOG_PATHS + " 条");
            }
        }
        return List.copyOf(normalized);
    }

    private String normalizeHttpUrl(String value, String message) {
        String normalized = requireText(value, message, 500);
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("http".equals(scheme) || "https".equals(scheme)) || uri.getHost() == null) {
                throw new IllegalArgumentException(message);
            }
            while (normalized.endsWith("/")) {
                normalized = normalized.substring(0, normalized.length() - 1);
            }
            return normalized;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(message, exception);
        }
    }

    private ProjectRuntimeInstanceSummary toSummary(ProjectRuntimeInstanceEntity entity) {
        ProjectEntity project = entity.getProject();
        ServerInfoEntity server = entity.getServer();
        return new ProjectRuntimeInstanceSummary(
                entity.getId(),
                project == null ? null : project.getId(),
                project == null ? "" : project.getName(),
                entity.getSourceType(),
                entity.getSourceBindingId(),
                entity.getName(),
                entity.getEnvironment(),
                entity.getServiceName(),
                Boolean.TRUE.equals(entity.getEnabled()),
                entity.getServerMode(),
                server == null ? null : server.getId(),
                server == null ? "" : server.getName(),
                entity.getExternalBaseUrl(),
                Boolean.TRUE.equals(entity.getLogEnabled()),
                parseLogPaths(entity.getLogPathsJson()),
                Boolean.TRUE.equals(entity.getHealthEnabled()),
                entity.getHealthProbeType(),
                entity.getHealthTarget(),
                formatTime(entity.getLastDeployedAt()),
                entity.getLastStatus(),
                entity.getLastStatusMessage(),
                formatTime(entity.getLastLogCollectedAt()),
                entity.getLastLogCollectStatus(),
                entity.getLastLogCollectMessage(),
                formatTime(entity.getLastHealthCheckedAt()),
                entity.getLastHealthScore(),
                entity.getLastHealthLevel(),
                entity.getLastHealthMessage(),
                entity.getLastHealthLatencyMs()
        );
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (Exception exception) {
            throw new IllegalArgumentException("日志路径序列化失败", exception);
        }
    }

    private List<String> parseLogPaths(String json) {
        String normalized = trimToNull(json);
        if (normalized == null) {
            return List.of();
        }
        try {
            return objectMapper.readValue(normalized, new TypeReference<>() {
            });
        } catch (Exception exception) {
            return List.of();
        }
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? "" : TIME_FORMATTER.format(value);
    }

    private String requireText(String value, String message, int maxLength) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException(message);
        }
        return limit(normalized, maxLength);
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
