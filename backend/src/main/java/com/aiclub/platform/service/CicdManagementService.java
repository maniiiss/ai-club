package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.JenkinsServerEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.dto.JenkinsBuildTriggerResult;
import com.aiclub.platform.dto.JenkinsBuildLogDetail;
import com.aiclub.platform.dto.JenkinsBuildSummary;
import com.aiclub.platform.dto.JenkinsJobSummary;
import com.aiclub.platform.dto.JenkinsServerSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.request.JenkinsServerRequest;
import com.aiclub.platform.dto.request.ProjectPipelineBindingRequest;
import com.aiclub.platform.repository.JenkinsServerRepository;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class CicdManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ProjectRepository projectRepository;
    private final JenkinsServerRepository jenkinsServerRepository;
    private final ProjectPipelineBindingRepository projectPipelineBindingRepository;
    private final TokenCipherService tokenCipherService;
    private final JenkinsApiService jenkinsApiService;
    private final ObjectMapper objectMapper;
    private final NotificationService notificationService;
    private final ProjectDataPermissionService projectDataPermissionService;

    public CicdManagementService(ProjectRepository projectRepository,
                                 JenkinsServerRepository jenkinsServerRepository,
                                 ProjectPipelineBindingRepository projectPipelineBindingRepository,
                                 TokenCipherService tokenCipherService,
                                 JenkinsApiService jenkinsApiService,
                                 ObjectMapper objectMapper,
                                 NotificationService notificationService,
                                 ProjectDataPermissionService projectDataPermissionService) {
        this.projectRepository = projectRepository;
        this.jenkinsServerRepository = jenkinsServerRepository;
        this.projectPipelineBindingRepository = projectPipelineBindingRepository;
        this.tokenCipherService = tokenCipherService;
        this.jenkinsApiService = jenkinsApiService;
        this.objectMapper = objectMapper;
        this.notificationService = notificationService;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    public PageResponse<JenkinsServerSummary> pageJenkinsServers(int page, int size, String keyword, Boolean enabled) {
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<JenkinsServerSummary> pageData = jenkinsServerRepository.findAll(jenkinsServerSpecification(keyword, enabled), pageable)
                .map(this::toJenkinsServerSummary);
        return PageResponse.from(pageData);
    }

    public List<JenkinsServerSummary> listJenkinsServerOptions() {
        return jenkinsServerRepository.findAllByEnabledTrueOrderByIdAsc().stream()
                .map(this::toJenkinsServerSummary)
                .toList();
    }

    @Transactional
    public JenkinsServerSummary createJenkinsServer(JenkinsServerRequest request) {
        JenkinsServerEntity entity = new JenkinsServerEntity();
        fillJenkinsServerEntity(entity, request, true);
        return toJenkinsServerSummary(jenkinsServerRepository.save(entity));
    }

    @Transactional
    public JenkinsServerSummary updateJenkinsServer(Long id, JenkinsServerRequest request) {
        JenkinsServerEntity entity = requireJenkinsServer(id);
        fillJenkinsServerEntity(entity, request, false);
        return toJenkinsServerSummary(jenkinsServerRepository.save(entity));
    }

    @Transactional
    public void deleteJenkinsServer(Long id) {
        JenkinsServerEntity entity = requireJenkinsServer(id);
        long bindingCount = projectPipelineBindingRepository.count((root, query, cb) -> cb.equal(root.get("jenkinsServer").get("id"), id));
        if (bindingCount > 0) {
            throw new IllegalArgumentException("当前 Jenkins 服务已被项目流水线绑定，请先删除绑定后再删除");
        }
        jenkinsServerRepository.delete(entity);
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public JenkinsServerSummary testJenkinsServer(Long id) {
        JenkinsServerEntity entity = requireJenkinsServer(id);
        try {
            String apiToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
            JenkinsApiService.JenkinsServerInfo info = jenkinsApiService.fetchServerInfo(entity.getBaseUrl(), entity.getUsername(), apiToken);
            entity.setLastJobCount(info.jobCount());
            entity.setLastTestStatus("SUCCESS");
            entity.setLastTestMessage(buildServerTestMessage(info));
            entity.setLastTestedAt(LocalDateTime.now());
            return toJenkinsServerSummary(jenkinsServerRepository.save(entity));
        } catch (RuntimeException exception) {
            entity.setLastTestStatus("FAILED");
            entity.setLastTestMessage(limitMessage(exception.getMessage()));
            entity.setLastTestedAt(LocalDateTime.now());
            jenkinsServerRepository.save(entity);
            throw exception;
        }
    }

    public List<JenkinsJobSummary> listJenkinsJobs(Long serverId) {
        JenkinsServerEntity entity = requireJenkinsServer(serverId);
        String apiToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
        return jenkinsApiService.listJobs(entity.getBaseUrl(), entity.getUsername(), apiToken).stream()
                .map(this::toJenkinsJobSummary)
                .toList();
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public JenkinsBuildTriggerResult triggerJenkinsJob(Long serverId, String jobName) {
        JenkinsServerEntity entity = requireJenkinsServer(serverId);
        if (!Boolean.TRUE.equals(entity.getEnabled())) {
            throw new IllegalArgumentException("关联的 Jenkins 服务未启用");
        }
        String normalizedJobName = trimToNull(jobName);
        if (normalizedJobName == null) {
            throw new IllegalArgumentException("Job 名称不能为空");
        }
        String apiToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
        JenkinsApiService.JenkinsTriggerResult result = jenkinsApiService.triggerJob(
                entity.getBaseUrl(),
                entity.getUsername(),
                apiToken,
                normalizedJobName,
                Map.of()
        );
        LocalDateTime now = LocalDateTime.now();
        return new JenkinsBuildTriggerResult(
                null,
                null,
                entity.getName(),
                normalizedJobName,
                trimToNull(result.triggerUrl()),
                result.message(),
                formatTime(now)
        );
    }

    public List<JenkinsBuildSummary> listPipelineBuilds(Long bindingId, int limit) {
        ProjectPipelineBindingEntity entity = requirePipelineBinding(bindingId);
        String apiToken = tokenCipherService.decrypt(entity.getJenkinsServer().getTokenCiphertext());
        return jenkinsApiService.listBuilds(
                        entity.getJenkinsServer().getBaseUrl(),
                        entity.getJenkinsServer().getUsername(),
                        apiToken,
                        entity.getJobName(),
                        limit
                ).stream()
                .map(this::toBuildSummary)
                .toList();
    }

    public JenkinsBuildLogDetail getPipelineBuildLog(Long bindingId, int buildNumber) {
        ProjectPipelineBindingEntity entity = requirePipelineBinding(bindingId);
        String apiToken = tokenCipherService.decrypt(entity.getJenkinsServer().getTokenCiphertext());
        JenkinsApiService.JenkinsBuildInfo buildInfo = jenkinsApiService.fetchBuild(
                entity.getJenkinsServer().getBaseUrl(),
                entity.getJenkinsServer().getUsername(),
                apiToken,
                entity.getJobName(),
                buildNumber
        );
        String consoleLog = jenkinsApiService.fetchBuildConsoleLog(
                entity.getJenkinsServer().getBaseUrl(),
                entity.getJenkinsServer().getUsername(),
                apiToken,
                entity.getJobName(),
                buildNumber
        );
        return new JenkinsBuildLogDetail(
                entity.getProject().getName(),
                entity.getJenkinsServer().getName(),
                entity.getJobName(),
                buildInfo.number(),
                trimToNull(buildInfo.result()),
                buildInfo.building(),
                formatTime(toLocalDateTime(buildInfo.timestamp())),
                buildInfo.duration(),
                formatDuration(buildInfo.duration()),
                trimToNull(buildInfo.url()),
                trimToNull(buildInfo.description()),
                consoleLog == null ? "" : consoleLog
        );
    }

    public PageResponse<ProjectPipelineBindingSummary> pagePipelineBindings(int page, int size, String keyword, Long serverId, Boolean enabled) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<ProjectPipelineBindingSummary> pageData = projectPipelineBindingRepository
                .findAll(pipelineBindingSpecification(keyword, serverId, enabled, scope), pageable)
                .map(this::toPipelineBindingSummary);
        return PageResponse.from(pageData);
    }

    @Transactional
    public ProjectPipelineBindingSummary createPipelineBinding(ProjectPipelineBindingRequest request) {
        ProjectPipelineBindingEntity entity = new ProjectPipelineBindingEntity();
        fillPipelineBindingEntity(entity, request, true);
        return toPipelineBindingSummary(projectPipelineBindingRepository.save(entity));
    }

    @Transactional
    public ProjectPipelineBindingSummary updatePipelineBinding(Long id, ProjectPipelineBindingRequest request) {
        ProjectPipelineBindingEntity entity = requirePipelineBinding(id);
        fillPipelineBindingEntity(entity, request, false);
        return toPipelineBindingSummary(projectPipelineBindingRepository.save(entity));
    }

    @Transactional
    public void deletePipelineBinding(Long id) {
        projectPipelineBindingRepository.delete(requirePipelineBinding(id));
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public JenkinsBuildTriggerResult triggerPipelineBuild(Long id) {
        return triggerPipelineBuild(requirePipelineBinding(id), null, "手动触发");
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public PipelineTriggerOutcome tryTriggerProjectPipeline(Long projectId, String branchOverride, String sourceDescription) {
        ProjectPipelineBindingEntity entity = projectPipelineBindingRepository.findByProject_Id(projectId).orElse(null);
        if (entity == null) {
            return PipelineTriggerOutcome.skipped("当前项目未配置 Jenkins 流水线绑定");
        }
        if (!Boolean.TRUE.equals(entity.getEnabled())) {
            return PipelineTriggerOutcome.skipped("项目流水线绑定未启用");
        }
        if (!Boolean.TRUE.equals(entity.getJenkinsServer().getEnabled())) {
            return PipelineTriggerOutcome.skipped("关联的 Jenkins 服务未启用");
        }
        try {
            JenkinsBuildTriggerResult result = triggerPipelineBuild(entity, branchOverride, sourceDescription);
            return PipelineTriggerOutcome.success(result.message(), result.triggerUrl(), result.jobName(), result.jenkinsServerName());
        } catch (RuntimeException exception) {
            return PipelineTriggerOutcome.failed(limitMessage(exception.getMessage()), entity.getJobName(), entity.getJenkinsServer().getName());
        }
    }

    private void fillJenkinsServerEntity(JenkinsServerEntity entity, JenkinsServerRequest request, boolean createMode) {
        entity.setName(request.name().trim());
        entity.setBaseUrl(normalizeBaseUrl(request.baseUrl()));
        entity.setUsername(request.username().trim());
        entity.setDescription(defaultString(request.description()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        if (hasText(request.apiToken())) {
            entity.setTokenCiphertext(tokenCipherService.encrypt(request.apiToken().trim()));
        } else if (createMode) {
            throw new IllegalArgumentException("新增 Jenkins 服务时必须填写 API Token");
        }
    }

    private JenkinsBuildTriggerResult triggerPipelineBuild(ProjectPipelineBindingEntity entity, String branchOverride, String sourceDescription) {
        LocalDateTime now = LocalDateTime.now();
        try {
            if (!Boolean.TRUE.equals(entity.getEnabled())) {
                throw new IllegalArgumentException("当前流水线绑定未启用");
            }
            if (!Boolean.TRUE.equals(entity.getJenkinsServer().getEnabled())) {
                throw new IllegalArgumentException("关联的 Jenkins 服务未启用");
            }
            String apiToken = tokenCipherService.decrypt(entity.getJenkinsServer().getTokenCiphertext());
            Map<String, String> parameters = parseBuildParameters(entity.getBuildParametersJson(), branchOverride, entity.getDefaultBranch());
            JenkinsApiService.JenkinsTriggerResult result = jenkinsApiService.triggerJob(
                    entity.getJenkinsServer().getBaseUrl(),
                    entity.getJenkinsServer().getUsername(),
                    apiToken,
                    entity.getJobName(),
                    parameters
            );
            String message = hasText(sourceDescription)
                    ? result.message() + "（来源：" + sourceDescription.trim() + "）"
                    : result.message();
            entity.setLastTriggerStatus("QUEUED");
            entity.setLastTriggerMessage(limitMessage(message));
            entity.setLastTriggeredAt(now);
            entity.setLastTriggerUrl(trimToNull(result.triggerUrl()));
            projectPipelineBindingRepository.save(entity);
            notifyCurrentUserPipelineQueued(entity);
            return new JenkinsBuildTriggerResult(
                    entity.getId(),
                    entity.getProject().getName(),
                    entity.getJenkinsServer().getName(),
                    entity.getJobName(),
                    trimToNull(result.triggerUrl()),
                    message,
                    formatTime(now)
            );
        } catch (RuntimeException exception) {
            entity.setLastTriggerStatus("FAILED");
            entity.setLastTriggerMessage(limitMessage(exception.getMessage()));
            entity.setLastTriggeredAt(now);
            projectPipelineBindingRepository.save(entity);
            notifyCurrentUserPipelineFailed(entity, exception.getMessage());
            throw exception;
        }
    }

    private void notifyCurrentUserPipelineQueued(ProjectPipelineBindingEntity entity) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (currentUserId == null) {
            return;
        }
        notificationService.sendToUser(
                currentUserId,
                NotificationService.TYPE_CICD,
                NotificationService.LEVEL_INFO,
                "流水线已触发",
                "项目《" + entity.getProject().getName() + "》的 Jenkins Job《" + entity.getJobName() + "》已进入队列。",
                "/cicd",
                "PIPELINE_BINDING",
                entity.getId()
        );
    }

    private void notifyCurrentUserPipelineFailed(ProjectPipelineBindingEntity entity, String reason) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (currentUserId == null) {
            return;
        }
        notificationService.sendToUser(
                currentUserId,
                NotificationService.TYPE_CICD,
                NotificationService.LEVEL_ERROR,
                "流水线触发失败",
                limitMessage("项目《" + entity.getProject().getName() + "》的 Jenkins Job《" + entity.getJobName() + "》触发失败：" + defaultString(reason)),
                "/cicd",
                "PIPELINE_BINDING",
                entity.getId()
        );
    }

    private void fillPipelineBindingEntity(ProjectPipelineBindingEntity entity, ProjectPipelineBindingRequest request, boolean createMode) {
        ProjectEntity project = requireProject(request.projectId());
        JenkinsServerEntity jenkinsServer = requireJenkinsServer(request.jenkinsServerId());
        projectPipelineBindingRepository.findByProject_Id(project.getId())
                .filter(existing -> !existing.getId().equals(entity.getId()))
                .ifPresent(item -> {
                    throw new IllegalArgumentException("当前项目已存在 Jenkins 流水线绑定，请直接编辑现有配置");
                });

        String jobName = request.jobName().trim();
        String apiToken = tokenCipherService.decrypt(jenkinsServer.getTokenCiphertext());
        JenkinsApiService.JenkinsJob job = jenkinsApiService.fetchJob(jenkinsServer.getBaseUrl(), jenkinsServer.getUsername(), apiToken, jobName);

        entity.setProject(project);
        entity.setJenkinsServer(jenkinsServer);
        entity.setJobName(jobName);
        entity.setJobUrl(trimToNull(job.url()));
        entity.setDefaultBranch(trimToNull(request.defaultBranch()));
        entity.setBuildParametersJson(normalizeBuildParametersJson(request.buildParametersJson()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));

        if (job.lastBuild() != null && !createMode) {
            entity.setLastTriggerStatus(trimToNull(job.lastBuild().result()));
            entity.setLastTriggerMessage("最近构建 #" + job.lastBuild().number());
            entity.setLastTriggeredAt(toLocalDateTime(job.lastBuild().timestamp()));
            entity.setLastTriggerUrl(trimToNull(job.lastBuild().url()));
        }
    }

    private Map<String, String> parseBuildParameters(String buildParametersJson, String branchOverride, String defaultBranch) {
        Map<String, String> parameters = new LinkedHashMap<>();
        String normalizedJson = trimToNull(buildParametersJson);
        if (normalizedJson != null) {
            try {
                JsonNode node = objectMapper.readTree(normalizedJson);
                if (!node.isObject()) {
                    throw new IllegalArgumentException("构建参数必须为 JSON 对象");
                }
                node.fields().forEachRemaining(entry -> parameters.put(entry.getKey(), entry.getValue().isNull() ? "" : entry.getValue().asText("")));
            } catch (IllegalArgumentException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalArgumentException("构建参数 JSON 格式不正确");
            }
        }
        String branch = trimToNull(branchOverride);
        if (branch == null) {
            branch = trimToNull(defaultBranch);
        }
        if (branch != null && !parameters.containsKey("branch") && !parameters.containsKey("BRANCH")) {
            parameters.put("branch", branch);
        }
        return parameters;
    }

    private String normalizeBuildParametersJson(String value) {
        String json = trimToNull(value);
        if (json == null) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new IllegalArgumentException("构建参数必须为 JSON 对象，例如 {\"branch\":\"main\"}");
            }
            return objectMapper.writeValueAsString(node);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
                throw new IllegalArgumentException("构建参数 JSON 格式不正确");
        }
    }

    private String buildServerTestMessage(JenkinsApiService.JenkinsServerInfo info) {
        StringBuilder builder = new StringBuilder("连接成功");
        if (hasText(info.version())) {
            builder.append("，版本：").append(info.version().trim());
        }
        if (hasText(info.primaryViewName())) {
            builder.append("，默认视图：").append(info.primaryViewName().trim());
        }
        builder.append("，Job 数：").append(info.jobCount());
        return limitMessage(builder.toString());
    }

    private JenkinsServerSummary toJenkinsServerSummary(JenkinsServerEntity entity) {
        return new JenkinsServerSummary(
                entity.getId(),
                entity.getName(),
                entity.getBaseUrl(),
                entity.getUsername(),
                entity.getDescription(),
                defaultBoolean(entity.getEnabled(), true),
                hasText(entity.getTokenCiphertext()),
                entity.getLastTestStatus(),
                entity.getLastTestMessage(),
                formatTime(entity.getLastTestedAt()),
                entity.getLastJobCount()
        );
    }

    private JenkinsJobSummary toJenkinsJobSummary(JenkinsApiService.JenkinsJob job) {
        return new JenkinsJobSummary(
                job.name(),
                job.fullName(),
                job.url(),
                job.color(),
                job.lastBuild() == null ? null : job.lastBuild().number(),
                job.lastBuild() == null ? null : trimToNull(job.lastBuild().result()),
                job.lastBuild() == null ? null : trimToNull(job.lastBuild().url()),
                job.lastBuild() == null ? null : formatTime(toLocalDateTime(job.lastBuild().timestamp()))
        );
    }

    private JenkinsBuildSummary toBuildSummary(JenkinsApiService.JenkinsBuildInfo build) {
        return new JenkinsBuildSummary(
                build.number(),
                trimToNull(build.url()),
                trimToNull(build.result()),
                build.building(),
                formatTime(toLocalDateTime(build.timestamp())),
                build.duration(),
                formatDuration(build.duration()),
                trimToNull(build.description())
        );
    }

    private ProjectPipelineBindingSummary toPipelineBindingSummary(ProjectPipelineBindingEntity entity) {
        return new ProjectPipelineBindingSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getJenkinsServer().getId(),
                entity.getJenkinsServer().getName(),
                entity.getJobName(),
                entity.getJobUrl(),
                entity.getDefaultBranch(),
                entity.getBuildParametersJson(),
                defaultBoolean(entity.getEnabled(), true),
                entity.getLastTriggerStatus(),
                entity.getLastTriggerMessage(),
                formatTime(entity.getLastTriggeredAt()),
                entity.getLastTriggerUrl()
        );
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private Specification<JenkinsServerEntity> jenkinsServerSpecification(String keyword, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("baseUrl")), pattern),
                        cb.like(cb.lower(root.get("username")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<ProjectPipelineBindingEntity> pipelineBindingSpecification(String keyword, Long serverId, Boolean enabled,
                                                                                    ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                var projectJoin = root.join("project", JoinType.LEFT);
                var serverJoin = root.join("jenkinsServer", JoinType.LEFT);
                predicates.add(cb.or(
                        cb.like(cb.lower(projectJoin.get("name")), pattern),
                        cb.like(cb.lower(serverJoin.get("name")), pattern),
                        cb.like(cb.lower(root.get("jobName")), pattern),
                        cb.like(cb.lower(root.get("defaultBranch")), pattern)
                ));
            }
            if (serverId != null) {
                predicates.add(cb.equal(root.get("jenkinsServer").get("id"), serverId));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 为项目流水线查询统一追加项目可见范围条件。
     */
    private void appendProjectVisibilityPredicate(List<Predicate> predicates,
                                                  jakarta.persistence.criteria.From<?, ProjectEntity> projectRoot,
                                                  jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                  jakarta.persistence.criteria.CriteriaBuilder cb,
                                                  ProjectDataPermissionService.ProjectDataScope scope) {
        if (scope.superAdmin()) {
            return;
        }
        DataPermissionScopeType visibilityScope = scope.policy().projectVisibilityScope();
        switch (visibilityScope) {
            case ALL -> {
                return;
            }
            case NONE -> predicates.add(cb.disjunction());
            case OWNER_ONLY -> predicates.add(cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()));
            case CREATOR_ONLY -> predicates.add(cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()));
            case OWNER_OR_CREATOR -> predicates.add(cb.or(
                    cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                    cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case PROJECT_PARTICIPANT -> {
                query.distinct(true);
                predicates.add(cb.or(
                        cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("members", JoinType.LEFT).get("id"), scope.userId())
                ));
            }
        }
    }

    private ProjectEntity requireProject(Long id) {
        ProjectEntity project = projectRepository.findById(id).orElseThrow(() -> new NoSuchElementException("项目不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireProjectVisible(project, scope);
        }
        return project;
    }

    private JenkinsServerEntity requireJenkinsServer(Long id) {
        return jenkinsServerRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Jenkins 服务不存在: " + id));
    }

    private ProjectPipelineBindingEntity requirePipelineBinding(Long id) {
        ProjectPipelineBindingEntity binding = projectPipelineBindingRepository.findById(id).orElseThrow(() -> new NoSuchElementException("项目流水线绑定不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requirePipelineBindingVisible(binding);
        }
        return binding;
    }

    private LocalDateTime toLocalDateTime(long timestamp) {
        if (timestamp <= 0) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timestamp), ZoneId.systemDefault());
    }

    private String normalizeBaseUrl(String value) {
        String baseUrl = trimToNull(value);
        if (baseUrl == null) {
            throw new IllegalArgumentException("Jenkins 地址不能为空");
        }
        while (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        return baseUrl;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean defaultBoolean(Boolean value, boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String formatDuration(long durationMillis) {
        if (durationMillis <= 0) {
            return "0秒";
        }
        long totalSeconds = durationMillis / 1000;
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;
        List<String> parts = new ArrayList<>();
        if (hours > 0) {
            parts.add(hours + "小时");
        }
        if (minutes > 0) {
            parts.add(minutes + "分钟");
        }
        if (seconds > 0 || parts.isEmpty()) {
            parts.add(seconds + "秒");
        }
        return String.join("", parts);
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "执行失败";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    public record PipelineTriggerOutcome(
            String status,
            String message,
            String triggerUrl,
            String jobName,
            String jenkinsServerName
    ) {
        public static PipelineTriggerOutcome success(String message, String triggerUrl, String jobName, String jenkinsServerName) {
            return new PipelineTriggerOutcome("SUCCESS", message, triggerUrl, jobName, jenkinsServerName);
        }

        public static PipelineTriggerOutcome failed(String message, String jobName, String jenkinsServerName) {
            return new PipelineTriggerOutcome("FAILED", message, null, jobName, jenkinsServerName);
        }

        public static PipelineTriggerOutcome skipped(String message) {
            return new PipelineTriggerOutcome("SKIPPED", message, null, null, null);
        }
    }
}
