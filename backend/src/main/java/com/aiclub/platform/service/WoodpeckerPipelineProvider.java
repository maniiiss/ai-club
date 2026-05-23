package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.WoodpeckerHealthSummary;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 平台内置 Woodpecker provider，负责把 AI Club Pipeline 映射到远端 Woodpecker 仓库和运行。
 */
@Service
public class WoodpeckerPipelineProvider {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /**
     * 健康检查只暴露平台执行底座状态，不再把 Woodpecker 的 forge 登录配置暴露给业务用户。
     */
    private static final String MISSING_CONFIG_MESSAGE = "AI Club Pipeline 执行底座缺少 PLATFORM_WOODPECKER_INTERNAL_BASE_URL "
            + "或 PLATFORM_WOODPECKER_API_TOKEN；业务用户无需登录 Woodpecker，请由管理员配置平台访问 Token";

    private final WoodpeckerPipelineProperties properties;
    private final WoodpeckerApiService woodpeckerApiService;

    public WoodpeckerPipelineProvider(WoodpeckerPipelineProperties properties,
                                      WoodpeckerApiService woodpeckerApiService) {
        this.properties = properties;
        this.woodpeckerApiService = woodpeckerApiService;
    }

    public WoodpeckerHealthSummary health() {
        boolean configured = properties.isConfigured();
        if (!properties.isEnabled()) {
            return new WoodpeckerHealthSummary(
                    false,
                    configured,
                    false,
                    properties.getInternalBaseUrl(),
                    properties.getPublicBaseUrl(),
                    "AI Club Pipeline 执行底座未启用",
                    formatTime(LocalDateTime.now()),
                    null
            );
        }
        if (!configured) {
            return new WoodpeckerHealthSummary(
                    true,
                    false,
                    false,
                    properties.getInternalBaseUrl(),
                    properties.getPublicBaseUrl(),
                    MISSING_CONFIG_MESSAGE,
                    formatTime(LocalDateTime.now()),
                    null
            );
        }
        try {
            woodpeckerApiService.fetchCurrentUser();
            return new WoodpeckerHealthSummary(
                    true,
                    true,
                    true,
                    properties.getInternalBaseUrl(),
                    properties.getPublicBaseUrl(),
                    "AI Club Pipeline 执行底座连接正常，业务用户无需登录 Woodpecker",
                    formatTime(LocalDateTime.now()),
                    null
            );
        } catch (RuntimeException exception) {
            return new WoodpeckerHealthSummary(
                    true,
                    true,
                    false,
                    properties.getInternalBaseUrl(),
                    properties.getPublicBaseUrl(),
                    limitMessage(exception.getMessage()),
                    formatTime(LocalDateTime.now()),
                    null
            );
        }
    }

    public WoodpeckerApiService.WoodpeckerRepository syncRepository(ProjectGitlabBindingEntity binding) {
        requireConfigured();
        if (binding == null) {
            throw new IllegalArgumentException("GitLab 绑定不能为空");
        }
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalArgumentException("GitLab 绑定未启用，无法同步 Woodpecker 仓库");
        }
        String repoFullName = resolveRepoFullName(binding);
        return woodpeckerApiService.lookupRepository(repoFullName)
                .orElseGet(() -> woodpeckerApiService.activateRepository(binding.getGitlabProjectId()));
    }

    public WoodpeckerApiService.WoodpeckerPipeline triggerPipeline(AiClubPipelineEntity pipeline,
                                                                  String branchOverride,
                                                                  String sourceDescription) {
        requireConfigured();
        if (pipeline == null) {
            throw new IllegalArgumentException("流水线不存在");
        }
        if (!Boolean.TRUE.equals(pipeline.getEnabled())) {
            throw new IllegalArgumentException("当前 AI Club Pipeline 未启用");
        }
        if (pipeline.getWoodpeckerRepoId() == null || pipeline.getWoodpeckerRepoId() <= 0L) {
            throw new IllegalArgumentException("流水线尚未同步 Woodpecker 仓库");
        }
        String branch = resolveTriggerBranch(pipeline, branchOverride);
        Map<String, String> variables = new LinkedHashMap<>();
        variables.put("AI_CLUB_PIPELINE_ID", String.valueOf(pipeline.getId()));
        variables.put("AI_CLUB_PROJECT_ID", String.valueOf(pipeline.getProject().getId()));
        variables.put("AI_CLUB_TRIGGER_SOURCE", hasText(sourceDescription) ? sourceDescription.trim() : "AI Club");
        return woodpeckerApiService.triggerPipeline(pipeline.getWoodpeckerRepoId(), branch, variables);
    }

    public String resolveRunUrl(AiClubPipelineEntity pipeline, WoodpeckerApiService.WoodpeckerPipeline run) {
        if (run != null && hasText(run.forgeUrl())) {
            return run.forgeUrl().trim();
        }
        if (pipeline == null || run == null) {
            return null;
        }
        return properties.publicPipelineUrl(pipeline.getWoodpeckerRepoFullName(), run.number());
    }

    public String resolveRepoUrl(WoodpeckerApiService.WoodpeckerRepository repository, ProjectGitlabBindingEntity binding) {
        if (repository != null && hasText(repository.forgeUrl())) {
            return repository.forgeUrl().trim();
        }
        if (binding != null && hasText(binding.getGitlabProjectWebUrl())) {
            return binding.getGitlabProjectWebUrl().trim();
        }
        return null;
    }

    private void requireConfigured() {
        if (!properties.isEnabled()) {
            throw new IllegalStateException("AI Club Pipeline 执行底座未启用，请设置 WOODPECKER_ENABLED=true");
        }
        if (!properties.isConfigured()) {
            throw new IllegalStateException(MISSING_CONFIG_MESSAGE);
        }
    }

    private String resolveRepoFullName(ProjectGitlabBindingEntity binding) {
        String repoFullName = firstText(binding.getGitlabProjectPath(), binding.getGitlabProjectRef());
        if (!hasText(repoFullName)) {
            throw new IllegalArgumentException("GitLab 绑定缺少项目路径，无法同步 Woodpecker 仓库");
        }
        return repoFullName.trim();
    }

    private String resolveTriggerBranch(AiClubPipelineEntity pipeline, String branchOverride) {
        String branch = firstText(
                branchOverride,
                pipeline.getDefaultBranch(),
                pipeline.getGitlabBinding().getDefaultTargetBranch(),
                pipeline.getGitlabBinding().getProductMainBranch()
        );
        return hasText(branch) ? branch.trim() : "main";
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "执行失败";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
