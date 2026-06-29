package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.GitlabApiSyncResult;
import com.aiclub.platform.dto.request.GitlabApiSyncRequest;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.service.apistudio.ApiStudioGitlabSyncService;
import com.aiclub.platform.service.apistudio.ApiStudioGitlabSyncService.SyncOutcome;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * GitLab 绑定仓库同步 API 编排服务。
 * 负责校验仓库类型、调用 code-processing 抽取 Spring 接口，并把生成项按 Controller 目录幂等
 * 写入原生 API Studio（{@code api_studio_*} 表）。
 */
@Service
public class GitlabApiSyncService {

    private static final String DEFAULT_BRANCH = "main";
    private static final String SUPPORTED_BACKEND_REPO_KIND = "BACKEND";
    private static final String SUPPORTED_MIXED_REPO_KIND = "MIXED";

    private final ProjectGitlabBindingRepository bindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final TokenCipherService tokenCipherService;
    private final GitlabApiService gitlabApiService;
    private final GitlabSpringApiExtractClientService extractClientService;
    private final ApiStudioGitlabSyncService apiStudioGitlabSyncService;
    private final ObjectMapper objectMapper;

    public GitlabApiSyncService(ProjectGitlabBindingRepository bindingRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                TokenCipherService tokenCipherService,
                                GitlabApiService gitlabApiService,
                                GitlabSpringApiExtractClientService extractClientService,
                                ApiStudioGitlabSyncService apiStudioGitlabSyncService,
                                ObjectMapper objectMapper) {
        this.bindingRepository = bindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.tokenCipherService = tokenCipherService;
        this.gitlabApiService = gitlabApiService;
        this.extractClientService = extractClientService;
        this.apiStudioGitlabSyncService = apiStudioGitlabSyncService;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行一次 GitLab 仓库到 API Studio 的同步 API。
     */
    @Transactional
    public GitlabApiSyncResult syncBindingApi(Long bindingId, GitlabApiSyncRequest request) {
        ProjectGitlabBindingEntity binding = bindingRepository.findById(bindingId)
                .orElseThrow(() -> new IllegalArgumentException("GitLab 绑定不存在"));
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalArgumentException("当前 GitLab 绑定已停用，不能同步 API");
        }
        String repoKind = resolveRepoKind(binding);
        if (!SUPPORTED_BACKEND_REPO_KIND.equals(repoKind) && !SUPPORTED_MIXED_REPO_KIND.equals(repoKind)) {
            throw new IllegalArgumentException("仅后端仓库和混合仓库支持同步 API");
        }
        String branch = resolveBranch(binding, request == null ? null : request.branch());
        GitlabCodeStructureClientService.StructureRepository repository = buildCodeStructureRepository(binding, branch);
        GitlabSpringApiExtractClientService.ExtractResponse extractResponse = extractClientService.extract(
                new GitlabSpringApiExtractClientService.ExtractRequest(repository)
        );

        ProjectEntity project = binding.getProject();
        Long actorUserId = resolveActorUserId(binding);
        SyncOutcome outcome = apiStudioGitlabSyncService.sync(
                project, binding.getId(), branch, extractResponse.endpoints(), actorUserId, extractResponse.warnings()
        );

        return new GitlabApiSyncResult(
                binding.getId(),
                binding.getProject().getId(),
                defaultString(extractResponse.branchName(), branch),
                defaultString(extractResponse.commitSha(), ""),
                extractResponse.scannedCount(),
                outcome.createdCount(),
                outcome.updatedCount(),
                outcome.deletedCount(),
                outcome.skippedCount(),
                outcome.warnings(),
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private Long resolveActorUserId(ProjectGitlabBindingEntity binding) {
        // 服务端触发的同步没有 HTTP 用户，使用项目创建者作为 audit 字段；缺失时传 null（DB 列可空）。
        ProjectEntity project = binding.getProject();
        if (project != null && project.getCreatorUser() != null && project.getCreatorUser().getId() != null) {
            return project.getCreatorUser().getId();
        }
        return null;
    }

    private String resolveRepoKind(ProjectGitlabBindingEntity binding) {
        String jsonText = trimToNull(binding.getTestProfileJson());
        if (jsonText == null) {
            return "";
        }
        try {
            return objectMapper.readTree(jsonText)
                    .path("repoKind")
                    .asText("")
                    .trim()
                    .toUpperCase(Locale.ROOT);
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitLab 绑定中的 testProfileJson 不是合法 JSON", exception);
        }
    }

    private String resolveBranch(ProjectGitlabBindingEntity binding, String requestedBranch) {
        String normalized = trimToNull(requestedBranch);
        if (normalized != null) {
            return normalized;
        }
        if (hasText(binding.getDefaultTargetBranch())) {
            return binding.getDefaultTargetBranch().trim();
        }
        return DEFAULT_BRANCH;
    }

    private GitlabCodeStructureClientService.StructureRepository buildCodeStructureRepository(ProjectGitlabBindingEntity binding,
                                                                                              String branch) {
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        ProjectGitlabBindingEntity refreshedBinding = refreshCloneUrlsIfRequired(binding, token);
        String repoUrl = resolveCloneUrl(refreshedBinding);
        if (!hasText(repoUrl)) {
            throw new IllegalStateException("当前 GitLab 绑定缺少可用的 HTTP Clone 地址");
        }
        return new GitlabCodeStructureClientService.StructureRepository(
                String.valueOf(refreshedBinding.getId()),
                defaultString(hasText(refreshedBinding.getGitlabProjectPath()) ? refreshedBinding.getGitlabProjectPath() : refreshedBinding.getGitlabProjectRef(), ""),
                defaultString(refreshedBinding.getGitlabProjectRef(), ""),
                defaultString(refreshedBinding.getGitlabProjectPath(), ""),
                repoUrl,
                branch,
                refreshedBinding.getApiBaseUrl(),
                token
        );
    }

    private ProjectGitlabBindingEntity refreshCloneUrlsIfRequired(ProjectGitlabBindingEntity binding, String token) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding;
        }
        GitlabApiService.GitlabProject project = gitlabApiService.fetchProject(binding.getApiBaseUrl(), token, binding.getGitlabProjectRef());
        binding.setGitlabProjectId(project.id());
        binding.setGitlabProjectName(project.name());
        binding.setGitlabProjectPath(project.pathWithNamespace());
        binding.setGitlabProjectWebUrl(project.webUrl());
        binding.setGitlabHttpCloneUrl(project.httpCloneUrl());
        binding.setGitlabSshCloneUrl(project.sshCloneUrl());
        if (!hasText(binding.getDefaultTargetBranch()) && hasText(project.defaultBranch())) {
            binding.setDefaultTargetBranch(project.defaultBranch());
        }
        return bindingRepository.save(binding);
    }

    private String resolveCloneUrl(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding.getGitlabHttpCloneUrl().trim();
        }
        if (hasText(binding.getGitlabProjectWebUrl())) {
            String webUrl = binding.getGitlabProjectWebUrl().trim();
            return webUrl.endsWith(".git") ? webUrl : webUrl + ".git";
        }
        return null;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
