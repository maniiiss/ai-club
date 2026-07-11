package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.OwnerRepoPushLogEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.ProjectOwnerRepoBindingEntity;
import com.aiclub.platform.dto.OwnerRepoPushContextSummary;
import com.aiclub.platform.dto.OwnerRepoPushLogSummary;
import com.aiclub.platform.dto.OwnerRepoPushResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.OwnerRepoPushRequest;
import com.aiclub.platform.repository.OwnerRepoPushLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.NoSuchElementException;

/**
 * 业主仓库代码推送编排服务。
 * 负责：权限校验 -> 解密源/目标凭据 -> 调 code-processing 镜像推送 ->
 * MERGE_REQUEST 方式时调 GitLab API 创建 MR -> 落库推送日志 + 更新绑定状态 -> 返回三态结果。
 * 编排模式参照 GiteeTestPlanPushService。
 */
@Service
@Transactional(readOnly = true)
public class OwnerRepoPushService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String STATUS_SUCCESS = "SUCCESS";
    private static final String STATUS_PARTIAL = "PARTIAL";
    private static final String STATUS_FAILED = "FAILED";
    private static final String PUSH_MODE_DIRECT = "DIRECT";
    private static final String PUSH_MODE_NEW_BRANCH = "NEW_BRANCH";
    private static final String PUSH_MODE_MERGE_REQUEST = "MERGE_REQUEST";

    private final OwnerRepoBindingManagementService bindingManagementService;
    private final ProjectGitlabBindingRepository gitlabBindingRepository;
    private final OwnerRepoPushLogRepository pushLogRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GitlabApiService gitlabApiService;
    private final TokenCipherService tokenCipherService;
    private final OwnerRepoPushClientService ownerRepoPushClientService;

    public OwnerRepoPushService(OwnerRepoBindingManagementService bindingManagementService,
                                ProjectGitlabBindingRepository gitlabBindingRepository,
                                OwnerRepoPushLogRepository pushLogRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                GitlabApiService gitlabApiService,
                                TokenCipherService tokenCipherService,
                                OwnerRepoPushClientService ownerRepoPushClientService) {
        this.bindingManagementService = bindingManagementService;
        this.gitlabBindingRepository = gitlabBindingRepository;
        this.pushLogRepository = pushLogRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.gitlabApiService = gitlabApiService;
        this.tokenCipherService = tokenCipherService;
        this.ownerRepoPushClientService = ownerRepoPushClientService;
    }

    /**
     * 获取推送前置上下文：是否可推送、禁用原因、最近推送状态。
     */
    public OwnerRepoPushContextSummary getPushContext(Long bindingId) {
        ProjectOwnerRepoBindingEntity binding = bindingManagementService.requireBinding(bindingId);
        String disabledReason = resolveDisabledReason(binding);
        return new OwnerRepoPushContextSummary(
                binding.getId(),
                disabledReason == null,
                disabledReason,
                binding.getLastPushStatus(),
                binding.getLastPushMessage(),
                formatTime(binding.getLastPushedAt())
        );
    }

    /**
     * 触发推送。失败时仍落库 FAILED 状态再返回结果，不抛异常导致前端无法展示状态。
     */
    @Transactional
    public OwnerRepoPushResult pushToOwnerRepo(Long bindingId, OwnerRepoPushRequest request) {
        ProjectOwnerRepoBindingEntity binding = bindingManagementService.requireBinding(bindingId);
        projectDataPermissionService.requireProjectVisible(binding.getProject());
        String disabledReason = resolveDisabledReason(binding);
        if (disabledReason != null) {
            throw new IllegalStateException(disabledReason);
        }

        ProjectGitlabBindingEntity sourceBinding = requireSourceBinding(request.sourceBindingId(), binding);
        String pushMode = normalizePushMode(request.pushMode(), binding.getDefaultPushMode());
        String sourceBranch = requireBranch(request.sourceBranch(), "源分支");
        String targetBranch = requireBranch(request.targetBranch(), "目标分支");

        LocalDateTime executedAt = LocalDateTime.now();
        String sourceToken = tokenCipherService.decrypt(sourceBinding.getTokenCiphertext());
        String targetToken = tokenCipherService.decrypt(binding.getTokenCiphertext());
        String sourceRepoUrl = resolveSourceCloneUrl(sourceBinding);

        try {
            // 1. 调 code-processing 执行镜像推送
            OwnerRepoPushClientService.MirrorPushResponse pushResponse = ownerRepoPushClientService.mirrorPush(
                    sourceRepoUrl, sourceToken, sourceBranch,
                    binding.getGitlabHttpCloneUrl(), targetToken, targetBranch, pushMode
            );

            String mergeRequestIid = null;
            String mergeRequestWebUrl = null;
            String summaryMessage;

            // 2. MERGE_REQUEST 方式：在业主仓库创建 MR（从推送的子分支到目标主分支）
            if (PUSH_MODE_MERGE_REQUEST.equals(pushMode)) {
                GitlabApiService.GitlabCreatedMergeRequest mr = createOwnerMergeRequest(
                        binding, targetToken, pushResponse.pushedBranch(), targetBranch, sourceBranch
                );
                mergeRequestIid = String.valueOf(mr.iid());
                mergeRequestWebUrl = mr.webUrl();
                summaryMessage = String.format("推送成功并创建 MR !%s：源分支 %s -> 业主仓库 %s",
                        mergeRequestIid, sourceBranch, pushResponse.pushedBranch());
            } else if (PUSH_MODE_DIRECT.equals(pushMode)) {
                summaryMessage = String.format("推送成功：源分支 %s -> 业主仓库 %s（直接覆盖）",
                        sourceBranch, targetBranch);
            } else {
                summaryMessage = String.format("推送成功：源分支 %s -> 业主仓库 %s",
                        sourceBranch, pushResponse.pushedBranch());
            }

            // 3. 落库推送日志 + 更新绑定状态
            savePushLog(binding, sourceBinding, sourceBranch, targetBranch, pushMode,
                    pushResponse.sourceCommitSha(), pushResponse.targetCommitSha(),
                    mergeRequestIid, mergeRequestWebUrl, STATUS_SUCCESS, summaryMessage, executedAt);
            updateBindingPushStatus(binding, STATUS_SUCCESS, summaryMessage, executedAt);

            return new OwnerRepoPushResult(
                    STATUS_SUCCESS, summaryMessage,
                    pushResponse.sourceCommitSha(), pushResponse.targetCommitSha(),
                    pushResponse.pushedBranch(), mergeRequestIid, mergeRequestWebUrl
            );
        } catch (RuntimeException exception) {
            String summaryMessage = limitMessage(exception.getMessage());
            savePushLog(binding, sourceBinding, sourceBranch, targetBranch, pushMode,
                    null, null, null, null, STATUS_FAILED, summaryMessage, executedAt);
            updateBindingPushStatus(binding, STATUS_FAILED, summaryMessage, executedAt);
            return new OwnerRepoPushResult(
                    STATUS_FAILED, summaryMessage, null, null, null, null, null
            );
        }
    }

    /**
     * 分页查询推送历史。
     */
    public PageResponse<OwnerRepoPushLogSummary> pagePushLogs(Long bindingId, int page, int size) {
        bindingManagementService.requireBinding(bindingId);
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "id"));
        Page<OwnerRepoPushLogSummary> pageData = pushLogRepository.findByBinding_IdOrderByIdDesc(bindingId, pageable)
                .map(this::toPushLogSummary);
        return PageResponse.from(pageData);
    }

    private ProjectGitlabBindingEntity requireSourceBinding(Long sourceBindingId, ProjectOwnerRepoBindingEntity ownerBinding) {
        ProjectGitlabBindingEntity sourceBinding = gitlabBindingRepository.findById(sourceBindingId)
                .orElseThrow(() -> new NoSuchElementException("源 GitLab 绑定不存在: " + sourceBindingId));
        if (!sourceBinding.getProject().getId().equals(ownerBinding.getProject().getId())) {
            throw new IllegalArgumentException("源 GitLab 绑定与业主仓库绑定不属于同一项目");
        }
        return sourceBinding;
    }

    private String resolveDisabledReason(ProjectOwnerRepoBindingEntity binding) {
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            return "业主仓库绑定已禁用";
        }
        if (!hasText(binding.getTokenCiphertext())) {
            return "业主仓库未配置访问 Token";
        }
        if (!hasText(binding.getGitlabHttpCloneUrl())) {
            return "业主仓库未测试连接，缺少 Clone 地址";
        }
        return null;
    }

    private GitlabApiService.GitlabCreatedMergeRequest createOwnerMergeRequest(ProjectOwnerRepoBindingEntity binding,
                                                                               String targetToken,
                                                                               String sourceBranch,
                                                                               String targetBranch,
                                                                               String originSourceBranch) {
        String title = String.format("交付推送：%s -> %s", originSourceBranch, targetBranch);
        String description = String.format("由平台代码仓库 %s 分支推送到业主仓库 %s 分支的交付 MR。\n\n推送分支：%s",
                originSourceBranch, targetBranch, sourceBranch);
        return gitlabApiService.createMergeRequest(
                binding.getApiBaseUrl(), targetToken, binding.getGitlabProjectRef(),
                sourceBranch, targetBranch, title, description
        );
    }

    private String resolveSourceCloneUrl(ProjectGitlabBindingEntity sourceBinding) {
        String cloneUrl = sourceBinding.getGitlabHttpCloneUrl();
        if (!hasText(cloneUrl)) {
            throw new IllegalStateException("源 GitLab 绑定未测试连接，缺少 Clone 地址");
        }
        return cloneUrl;
    }

    private void savePushLog(ProjectOwnerRepoBindingEntity binding,
                             ProjectGitlabBindingEntity sourceBinding,
                             String sourceBranch, String targetBranch, String pushMode,
                             String sourceCommitSha, String targetCommitSha,
                             String mergeRequestIid, String mergeRequestWebUrl,
                             String executionStatus, String summaryMessage, LocalDateTime executedAt) {
        OwnerRepoPushLogEntity log = new OwnerRepoPushLogEntity();
        log.setBinding(binding);
        log.setSourceBinding(sourceBinding);
        log.setSourceBranch(sourceBranch);
        log.setTargetBranch(targetBranch);
        log.setPushMode(pushMode);
        log.setSourceCommitSha(sourceCommitSha);
        log.setTargetCommitSha(targetCommitSha);
        log.setMergeRequestIid(mergeRequestIid);
        log.setMergeRequestWebUrl(mergeRequestWebUrl);
        log.setExecutionStatus(executionStatus);
        log.setSummaryMessage(summaryMessage);
        log.setExecutedAt(executedAt);
        pushLogRepository.save(log);
    }

    private void updateBindingPushStatus(ProjectOwnerRepoBindingEntity binding, String status, String message, LocalDateTime executedAt) {
        binding.setLastPushStatus(status);
        binding.setLastPushMessage(limitBindingMessage(message));
        binding.setLastPushedAt(executedAt);
    }

    private OwnerRepoPushLogSummary toPushLogSummary(OwnerRepoPushLogEntity entity) {
        ProjectGitlabBindingEntity sourceBinding = entity.getSourceBinding();
        return new OwnerRepoPushLogSummary(
                entity.getId(),
                sourceBinding == null ? null : sourceBinding.getId(),
                sourceBinding == null ? null : sourceBinding.getGitlabProjectName(),
                entity.getSourceBranch(),
                entity.getTargetBranch(),
                entity.getPushMode(),
                entity.getSourceCommitSha(),
                entity.getTargetCommitSha(),
                entity.getMergeRequestIid(),
                entity.getMergeRequestWebUrl(),
                entity.getExecutionStatus(),
                entity.getSummaryMessage(),
                formatTime(entity.getExecutedAt())
        );
    }

    private String normalizePushMode(String value, String fallback) {
        String mode = trimToNull(value);
        if (mode == null) {
            mode = trimToNull(fallback);
        }
        if (mode == null) {
            mode = PUSH_MODE_NEW_BRANCH;
        }
        mode = mode.toUpperCase();
        if (!PUSH_MODE_DIRECT.equals(mode) && !PUSH_MODE_NEW_BRANCH.equals(mode) && !PUSH_MODE_MERGE_REQUEST.equals(mode)) {
            throw new IllegalArgumentException("推送方式仅支持 DIRECT / NEW_BRANCH / MERGE_REQUEST");
        }
        return mode;
    }

    private String requireBranch(String value, String label) {
        String branch = trimToNull(value);
        if (!hasText(branch)) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return branch;
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
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

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "推送失败";
        }
        String value = message.trim();
        return value.length() > 1000 ? value.substring(0, 1000) : value;
    }

    /**
     * 绑定表 last_push_message 字段上限 500 字，推送日志 summary_message 上限 1000 字。
     */
    private String limitBindingMessage(String message) {
        if (!hasText(message)) {
            return "推送失败";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }
}
