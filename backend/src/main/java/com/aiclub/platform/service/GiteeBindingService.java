package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.IterationGiteeBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import com.aiclub.platform.dto.GiteeMilestoneSummary;
import com.aiclub.platform.dto.GiteeMemberSummary;
import com.aiclub.platform.dto.GiteeProgramSummary;
import com.aiclub.platform.dto.IterationGiteeBindingSummary;
import com.aiclub.platform.dto.ProjectGiteeBindingSummary;
import com.aiclub.platform.dto.request.IterationGiteeBindingRequest;
import com.aiclub.platform.dto.request.ProjectGiteeBindingRequest;
import com.aiclub.platform.repository.IterationGiteeBindingRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGiteeBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 管理 Gitee 项目与迭代绑定。
 * 第一版只保存绑定关系，不导入项目和迭代主数据。
 * 由于数据库字段已落地为 milestone 命名，这里内部继续复用旧字段，
 * 但远端实际已经切换为 Gitee Scrum Sprint 迭代接口。
 */
@Service
@Transactional(readOnly = true)
public class GiteeBindingService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ProjectRepository projectRepository;
    private final IterationRepository iterationRepository;
    private final ProjectGiteeBindingRepository projectGiteeBindingRepository;
    private final IterationGiteeBindingRepository iterationGiteeBindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GiteeApiService giteeApiService;
    private final TokenCipherService tokenCipherService;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final String defaultApiUrl;

    public GiteeBindingService(ProjectRepository projectRepository,
                               IterationRepository iterationRepository,
                               ProjectGiteeBindingRepository projectGiteeBindingRepository,
                               IterationGiteeBindingRepository iterationGiteeBindingRepository,
                               ProjectDataPermissionService projectDataPermissionService,
                               GiteeApiService giteeApiService,
                               TokenCipherService tokenCipherService,
                               PlatformEnvVarResolver platformEnvVarResolver,
                               @org.springframework.beans.factory.annotation.Value("${platform.gitee.default-api-url:}") String defaultApiUrl) {
        this.projectRepository = projectRepository;
        this.iterationRepository = iterationRepository;
        this.projectGiteeBindingRepository = projectGiteeBindingRepository;
        this.iterationGiteeBindingRepository = iterationGiteeBindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.giteeApiService = giteeApiService;
        this.tokenCipherService = tokenCipherService;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.defaultApiUrl = defaultApiUrl;
    }

    public ProjectGiteeBindingSummary getProjectBinding(Long projectId) {
        requireProject(projectId);
        return projectGiteeBindingRepository.findByProject_Id(projectId)
                .map(this::toProjectBindingSummary)
                .orElse(null);
    }

    public List<GiteeProgramSummary> listProjectPrograms() {
        String apiBaseUrl = resolveApiBaseUrl(null);
        Long enterpriseId = resolveEnterpriseId(null);
        String accessToken = resolveAccessToken(null, true);
        return giteeApiService.listPrograms(apiBaseUrl, accessToken, enterpriseId).stream()
                .map(item -> new GiteeProgramSummary(item.id(), item.name(), item.ident()))
                .toList();
    }

    public List<GiteeMemberSummary> listEnterpriseMembers(String keyword) {
        String apiBaseUrl = resolveApiBaseUrl(null);
        Long enterpriseId = resolveEnterpriseId(null);
        String accessToken = resolveAccessToken(null, true);
        return giteeApiService.listMembers(apiBaseUrl, accessToken, enterpriseId, keyword).stream()
                .map(item -> new GiteeMemberSummary(
                        item.id(),
                        item.username(),
                        item.name(),
                        item.email(),
                        item.avatarUrl()
                ))
                .toList();
    }

    public IterationGiteeBindingSummary getIterationBinding(Long iterationId) {
        IterationEntity iteration = requireIteration(iterationId);
        return iterationGiteeBindingRepository.findByIteration_Id(iteration.getId())
                .map(this::toIterationBindingSummary)
                .orElse(null);
    }

    public List<GiteeMilestoneSummary> listProjectMilestones(Long projectId) {
        ProjectGiteeBindingEntity projectBinding = requireProjectBinding(projectId);
        String accessToken = resolveAccessToken(projectBinding, false);
        return giteeApiService.listMilestones(
                        resolveApiBaseUrl(projectBinding),
                        accessToken,
                        resolveEnterpriseId(projectBinding),
                        projectBinding.getGiteeProgramId()
                ).stream()
                .map(item -> new GiteeMilestoneSummary(
                        item.id(),
                        item.title(),
                        item.state(),
                        item.startDate(),
                        item.endDate()
                ))
                .toList();
    }

    @Transactional
    public ProjectGiteeBindingSummary createProjectBinding(Long projectId, ProjectGiteeBindingRequest request) {
        ProjectEntity project = requireProject(projectId);
        if (projectGiteeBindingRepository.findByProject_Id(projectId).isPresent()) {
            throw new IllegalArgumentException("当前项目已绑定 Gitee 项目，请改用更新操作");
        }
        String apiBaseUrl = resolveApiBaseUrl(null);
        Long enterpriseId = resolveEnterpriseId(null);
        String accessToken = resolveAccessToken(null, true);
        GiteeApiService.GiteeProgram program = giteeApiService.fetchProgram(apiBaseUrl, accessToken, enterpriseId, request.giteeProgramId());

        ProjectGiteeBindingEntity entity = new ProjectGiteeBindingEntity();
        entity.setProject(project);
        entity.setEnterpriseId(enterpriseId);
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setAccessTokenCiphertext(tokenCipherService.encrypt(accessToken));
        entity.setGiteeProgramId(program.id());
        entity.setGiteeProgramName(program.name());
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        entity.setLastTestStatus("SUCCESS");
        entity.setLastTestMessage("连接成功");
        entity.setLastTestedAt(LocalDateTime.now());
        return toProjectBindingSummary(projectGiteeBindingRepository.save(entity));
    }

    @Transactional
    public ProjectGiteeBindingSummary updateProjectBinding(Long projectId, ProjectGiteeBindingRequest request) {
        ProjectEntity project = requireProject(projectId);
        ProjectGiteeBindingEntity entity = requireProjectBinding(projectId);
        String apiBaseUrl = resolveApiBaseUrl(entity);
        Long enterpriseId = resolveEnterpriseId(entity);
        String accessToken = resolveAccessToken(entity, false);
        GiteeApiService.GiteeProgram program = giteeApiService.fetchProgram(apiBaseUrl, accessToken, enterpriseId, request.giteeProgramId());

        entity.setProject(project);
        entity.setEnterpriseId(enterpriseId);
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setAccessTokenCiphertext(tokenCipherService.encrypt(accessToken));
        entity.setGiteeProgramId(program.id());
        entity.setGiteeProgramName(program.name());
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        entity.setLastTestStatus("SUCCESS");
        entity.setLastTestMessage("连接成功");
        entity.setLastTestedAt(LocalDateTime.now());
        return toProjectBindingSummary(projectGiteeBindingRepository.save(entity));
    }

    @Transactional
    public IterationGiteeBindingSummary createIterationBinding(Long iterationId, IterationGiteeBindingRequest request) {
        IterationEntity iteration = requireIteration(iterationId);
        if (iterationGiteeBindingRepository.findByIteration_Id(iterationId).isPresent()) {
            throw new IllegalArgumentException("当前迭代已绑定 Gitee 迭代，请改用更新操作");
        }
        ProjectGiteeBindingEntity projectBinding = requireProjectBinding(iteration.getProject().getId());
        GiteeApiService.GiteeMilestone milestone = requireMilestone(projectBinding, request.giteeMilestoneId());

        IterationGiteeBindingEntity entity = new IterationGiteeBindingEntity();
        entity.setIteration(iteration);
        entity.setProject(iteration.getProject());
        entity.setGiteeMilestoneId(milestone.id());
        entity.setGiteeMilestoneTitle(milestone.title());
        validateMilestoneUniqueness(iteration.getProject().getId(), milestone.id(), null);
        return toIterationBindingSummary(iterationGiteeBindingRepository.save(entity));
    }

    @Transactional
    public IterationGiteeBindingSummary updateIterationBinding(Long iterationId, IterationGiteeBindingRequest request) {
        IterationEntity iteration = requireIteration(iterationId);
        IterationGiteeBindingEntity entity = requireIterationBinding(iterationId);
        ProjectGiteeBindingEntity projectBinding = requireProjectBinding(iteration.getProject().getId());
        GiteeApiService.GiteeMilestone milestone = requireMilestone(projectBinding, request.giteeMilestoneId());

        validateMilestoneUniqueness(iteration.getProject().getId(), milestone.id(), entity.getId());
        entity.setIteration(iteration);
        entity.setProject(iteration.getProject());
        entity.setGiteeMilestoneId(milestone.id());
        entity.setGiteeMilestoneTitle(milestone.title());
        return toIterationBindingSummary(iterationGiteeBindingRepository.save(entity));
    }

    private GiteeApiService.GiteeMilestone requireMilestone(ProjectGiteeBindingEntity projectBinding, Long milestoneId) {
        String accessToken = resolveAccessToken(projectBinding, false);
        return giteeApiService.listMilestones(
                        resolveApiBaseUrl(projectBinding),
                        accessToken,
                        resolveEnterpriseId(projectBinding),
                        projectBinding.getGiteeProgramId()
                ).stream()
                .filter(item -> item.id().equals(milestoneId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("指定 Gitee 迭代不属于当前绑定的 Gitee 项目"));
    }

    private void validateMilestoneUniqueness(Long projectId, Long milestoneId, Long currentBindingId) {
        Long excludedId = currentBindingId == null ? -1L : currentBindingId;
        if (iterationGiteeBindingRepository.existsByProject_IdAndGiteeMilestoneIdAndIdNot(projectId, milestoneId, excludedId)) {
            throw new IllegalArgumentException("当前项目下已有其他迭代绑定了该 Gitee 迭代");
        }
    }

    private ProjectEntity requireProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private IterationEntity requireIteration(Long iterationId) {
        IterationEntity iteration = iterationRepository.findById(iterationId)
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
        projectDataPermissionService.requireIterationVisible(iteration);
        return iteration;
    }

    private ProjectGiteeBindingEntity requireProjectBinding(Long projectId) {
        requireProject(projectId);
        return projectGiteeBindingRepository.findByProject_Id(projectId)
                .orElseThrow(() -> new NoSuchElementException("当前项目尚未绑定 Gitee 项目"));
    }

    private IterationGiteeBindingEntity requireIterationBinding(Long iterationId) {
        requireIteration(iterationId);
        return iterationGiteeBindingRepository.findByIteration_Id(iterationId)
                .orElseThrow(() -> new NoSuchElementException("当前迭代尚未绑定 Gitee 里程碑"));
    }

    private String resolveApiBaseUrl(ProjectGiteeBindingEntity existingBinding) {
        String resolved = platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITEE_DEFAULT_API_URL,
                () -> existingBinding == null ? null : existingBinding.getApiBaseUrl(),
                defaultApiUrl
        );
        if (!hasText(resolved)) {
            throw new IllegalArgumentException("Gitee API 地址不能为空");
        }
        while (resolved.endsWith("/")) {
            resolved = resolved.substring(0, resolved.length() - 1);
        }
        return giteeApiService.normalizeEnterpriseApiBaseUrl(resolved);
    }

    private Long resolveEnterpriseId(ProjectGiteeBindingEntity existingBinding) {
        try {
            String resolved = platformEnvVarResolver.resolve(
                    PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                    () -> existingBinding != null && existingBinding.getEnterpriseId() != null
                            ? String.valueOf(existingBinding.getEnterpriseId())
                            : null
            ).value();
            return Long.parseLong(resolved);
        } catch (RuntimeException exception) {
            throw buildEnvVarException("Gitee 企业ID", exception);
        }
    }

    private String resolveAccessToken(ProjectGiteeBindingEntity existingBinding, boolean requiredForCreate) {
        try {
            return platformEnvVarResolver.resolve(
                    PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN,
                    () -> existingBinding != null && hasText(existingBinding.getAccessTokenCiphertext())
                            ? tokenCipherService.decrypt(existingBinding.getAccessTokenCiphertext())
                            : null
            ).value();
        } catch (RuntimeException exception) {
            if (requiredForCreate) {
                throw buildEnvVarException("Gitee Access Token", exception);
            }
            throw new IllegalArgumentException("当前项目缺少可用的 Gitee Access Token，请先到系统设置-环境变量管理补齐配置", exception);
        }
    }

    private ProjectGiteeBindingSummary toProjectBindingSummary(ProjectGiteeBindingEntity entity) {
        return new ProjectGiteeBindingSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getEnterpriseId(),
                resolveApiBaseUrl(entity),
                entity.getGiteeProgramId(),
                entity.getGiteeProgramName(),
                canResolveAccessToken(entity),
                defaultBoolean(entity.getEnabled(), true),
                entity.getLastTestStatus(),
                entity.getLastTestMessage(),
                formatTime(entity.getLastTestedAt())
        );
    }

    private IterationGiteeBindingSummary toIterationBindingSummary(IterationGiteeBindingEntity entity) {
        return new IterationGiteeBindingSummary(
                entity.getId(),
                entity.getIteration().getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getIteration().getName(),
                entity.getGiteeMilestoneId(),
                entity.getGiteeMilestoneTitle()
        );
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private String limitMessage(String value) {
        if (!hasText(value)) {
            return "连接失败";
        }
        String normalized = value.trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean defaultBoolean(Boolean value, boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private boolean canResolveAccessToken(ProjectGiteeBindingEntity existingBinding) {
        try {
            return hasText(resolveAccessToken(existingBinding, false));
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private IllegalArgumentException buildEnvVarException(String label, RuntimeException exception) {
        String message = trimToDefault(exception.getMessage(), label + "配置异常");
        if (message.contains("未配置")) {
            return new IllegalArgumentException("请先在系统设置-环境变量管理中配置 " + label, exception);
        }
        return new IllegalArgumentException("系统设置-环境变量管理中的" + label + "配置无效：" + message, exception);
    }

    private String trimToDefault(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }
}
