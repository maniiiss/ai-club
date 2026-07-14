package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunTargetEntity;
import com.aiclub.platform.domain.model.SelfUpgradeSuggestionEntity;
import com.aiclub.platform.domain.model.SelfUpgradeSuggestionOccurrenceEntity;
import com.aiclub.platform.domain.model.SelfUpgradeWorkItemEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.SelfUpgradeArtifactLink;
import com.aiclub.platform.dto.SelfUpgradeSuggestionDetail;
import com.aiclub.platform.dto.SelfUpgradeSuggestionOccurrenceSummary;
import com.aiclub.platform.dto.SelfUpgradeSuggestionSummary;
import com.aiclub.platform.dto.SelfUpgradeWorkItemSummary;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.SelfUpgradeSuggestionOccurrenceRepository;
import com.aiclub.platform.repository.SelfUpgradeSuggestionRepository;
import com.aiclub.platform.repository.SelfUpgradeWorkItemRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 自升级建议服务。
 * 负责建议卡片分页、详情、去重聚合、重开通知，以及“接受建议生成工作项”的幂等逻辑。
 */
@Service
@Transactional(readOnly = true)
public class SelfUpgradeSuggestionService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<String> ACTIVE_SUGGESTION_STATUSES = Set.of("OPEN", "ACCEPTED", "IN_PROGRESS");
    private static final Set<String> CLOSED_SUGGESTION_STATUSES = Set.of("RESOLVED", "REJECTED");
    private static final List<String> ACTIVE_WORK_ITEM_STATUSES = List.of("TODO", "RUNNING", "VERIFYING");
    private static final String NOTIFICATION_BIZ_TYPE = "SELF_UPGRADE_SUGGEST";

    private final SelfUpgradeSuggestionRepository suggestionRepository;
    private final SelfUpgradeSuggestionOccurrenceRepository occurrenceRepository;
    private final SelfUpgradeWorkItemRepository workItemRepository;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final SelfUpgradeConfigService selfUpgradeConfigService;
    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public SelfUpgradeSuggestionService(SelfUpgradeSuggestionRepository suggestionRepository,
                                        SelfUpgradeSuggestionOccurrenceRepository occurrenceRepository,
                                        SelfUpgradeWorkItemRepository workItemRepository,
                                        ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                        ExecutionArtifactRepository executionArtifactRepository,
                                        SelfUpgradeConfigService selfUpgradeConfigService,
                                        NotificationService notificationService,
                                        UserRepository userRepository,
                                        ObjectMapper objectMapper) {
        this.suggestionRepository = suggestionRepository;
        this.occurrenceRepository = occurrenceRepository;
        this.workItemRepository = workItemRepository;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.selfUpgradeConfigService = selfUpgradeConfigService;
        this.notificationService = notificationService;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    public PageResponse<SelfUpgradeSuggestionSummary> pageSuggestions(int page,
                                                                      int size,
                                                                      String keyword,
                                                                      String status,
                                                                      String category,
                                                                      String severity) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "lastFoundAt", "id"));
        Page<SelfUpgradeSuggestionSummary> pageData = suggestionRepository.findAll(suggestionSpecification(keyword, status, category, severity), pageable)
                .map(this::toSuggestionSummary);
        return PageResponse.from(pageData);
    }

    public SelfUpgradeSuggestionDetail getSuggestion(Long suggestionId) {
        return toSuggestionDetail(requireSuggestion(suggestionId));
    }

    /**
     * 接受建议时优先复用仍未关闭的整改工作项，避免同一建议反复命中后产生多条并行工单。
     */
    @Transactional
    public SelfUpgradeSuggestionDetail acceptSuggestion(Long suggestionId) {
        SelfUpgradeSuggestionEntity suggestion = requireSuggestion(suggestionId);
        UserEntity currentUser = requireCurrentUser();
        SelfUpgradeWorkItemEntity activeWorkItem = workItemRepository.findFirstBySuggestion_IdAndStatusInOrderByIdDesc(suggestionId, ACTIVE_WORK_ITEM_STATUSES)
                .orElse(null);
        if (activeWorkItem == null) {
            activeWorkItem = new SelfUpgradeWorkItemEntity();
            activeWorkItem.setSuggestion(suggestion);
            activeWorkItem.setTitle("【自升级整改】" + suggestion.getTitle());
            activeWorkItem.setPriority(mapPriority(suggestion.getSeverity()));
            activeWorkItem.setRepositoryBindingsJson(buildDefaultRepositoryBindingsJson());
        }
        activeWorkItem.setDescription(buildWorkItemDescription(suggestion));
        activeWorkItem.setExecutionPrompt(buildExecutionPrompt(suggestion));
        activeWorkItem.setAcceptedByUser(currentUser);
        if (activeWorkItem.getAcceptedAt() == null) {
            activeWorkItem.setAcceptedAt(LocalDateTime.now());
        }
        activeWorkItem.setStatus("TODO");
        SelfUpgradeWorkItemEntity savedWorkItem = workItemRepository.save(activeWorkItem);
        suggestion.setLinkedWorkItem(savedWorkItem);
        suggestion.setStatus("ACCEPTED");
        suggestionRepository.save(suggestion);
        return toSuggestionDetail(suggestion);
    }

    @Transactional
    public SelfUpgradeSuggestionDetail rejectSuggestion(Long suggestionId) {
        SelfUpgradeSuggestionEntity suggestion = requireSuggestion(suggestionId);
        suggestion.setStatus("REJECTED");
        suggestionRepository.save(suggestion);
        return toSuggestionDetail(suggestion);
    }

    /**
     * 巡检结果写回时按稳定指纹去重，并在命中新旧状态时分别执行累加、重开和通知逻辑。
     */
    @Transactional
    public IngestOutcome recordFinding(SelfUpgradePatrolRunEntity run,
                                       SelfUpgradePatrolRunTargetEntity runTarget,
                                       JsonNode findingNode,
                                       List<ExecutionArtifactEntity> executionArtifacts) {
        String title = requireFindingText(findingNode, "title", "建议标题不能为空");
        String category = normalizeCode(readText(findingNode, "category"), "UX");
        String severity = normalizeSeverity(readText(findingNode, "severity"));
        String summary = defaultString(readText(findingNode, "summary"));
        String evidenceMarkdown = defaultString(readText(findingNode, "evidenceMarkdown"));
        String pagePath = normalizePagePath(readText(findingNode, "pagePath"), runTarget == null ? null : runTarget.getPagePath());
        String domHintJson = normalizeDomHint(findingNode.get("domHintJson"));
        String fingerprint = buildFingerprint(run, pagePath, category, title, domHintJson);
        LocalDateTime foundAt = LocalDateTime.now();

        SelfUpgradeSuggestionEntity suggestion = suggestionRepository.findByFingerprint(fingerprint).orElse(null);
        boolean opened = false;
        boolean reopened = false;
        if (suggestion == null) {
            suggestion = new SelfUpgradeSuggestionEntity();
            suggestion.setFingerprint(fingerprint);
            suggestion.setTitle(title);
            suggestion.setCategory(category);
            suggestion.setSeverity(severity);
            suggestion.setStatus("OPEN");
            suggestion.setFirstFoundAt(foundAt);
            suggestion.setHitCount(1);
            opened = true;
        } else {
            suggestion.setHitCount(suggestion.getHitCount() + 1);
            if (CLOSED_SUGGESTION_STATUSES.contains(normalizeCode(suggestion.getStatus(), ""))) {
                suggestion.setStatus("OPEN");
                suggestion.setReopenCount(suggestion.getReopenCount() + 1);
                reopened = true;
            }
            suggestion.setTitle(title);
            suggestion.setCategory(category);
            suggestion.setSeverity(severity);
        }
        suggestion.setLastFoundAt(foundAt);
        suggestion.setLatestSummary(summary);
        suggestion.setLatestEvidenceMarkdown(evidenceMarkdown);
        suggestion.setLatestRun(run);
        suggestion.setLatestTarget(runTarget);
        suggestion = suggestionRepository.save(suggestion);

        SelfUpgradeSuggestionOccurrenceEntity occurrence = new SelfUpgradeSuggestionOccurrenceEntity();
        occurrence.setSuggestion(suggestion);
        occurrence.setRun(run);
        occurrence.setRunTarget(runTarget);
        occurrence.setFoundAt(foundAt);
        occurrence.setEvidenceMarkdown(evidenceMarkdown);
        occurrence.setExecutionArtifactRefsJson(resolveArtifactRefsJson(findingNode.get("executionArtifactRefs"), executionArtifacts));
        occurrence.setPagePath(pagePath);
        occurrence.setDomHintJson(domHintJson);
        occurrenceRepository.save(occurrence);

        refreshActiveWorkItemContextIfNeeded(suggestion);
        if (opened || reopened) {
            sendSuggestionNotificationWithBot(suggestion, reopened);
        }
        return new IngestOutcome(suggestion, opened, reopened);
    }

    public SelfUpgradeSuggestionSummary toSuggestionSummary(SelfUpgradeSuggestionEntity entity) {
        return new SelfUpgradeSuggestionSummary(
                entity.getId(),
                entity.getFingerprint(),
                entity.getTitle(),
                entity.getCategory(),
                entity.getSeverity(),
                entity.getStatus(),
                entity.getHitCount(),
                entity.getReopenCount(),
                formatTime(entity.getFirstFoundAt()),
                formatTime(entity.getLastFoundAt()),
                entity.getLatestSummary(),
                entity.getLatestEvidenceMarkdown(),
                entity.getLatestRun() == null ? null : entity.getLatestRun().getId(),
                entity.getLatestTarget() == null ? null : entity.getLatestTarget().getId(),
                entity.getLinkedWorkItem() == null ? null : entity.getLinkedWorkItem().getId()
        );
    }

    public SelfUpgradeSuggestionDetail toSuggestionDetail(SelfUpgradeSuggestionEntity entity) {
        SelfUpgradeWorkItemEntity workItem = entity.getLinkedWorkItem();
        List<SelfUpgradeSuggestionOccurrenceSummary> occurrences = occurrenceRepository.findAllBySuggestion_IdOrderByFoundAtDescIdDesc(entity.getId()).stream()
                .map(this::toOccurrenceSummary)
                .toList();
        return new SelfUpgradeSuggestionDetail(
                entity.getId(),
                entity.getFingerprint(),
                entity.getTitle(),
                entity.getCategory(),
                entity.getSeverity(),
                entity.getStatus(),
                entity.getHitCount(),
                entity.getReopenCount(),
                formatTime(entity.getFirstFoundAt()),
                formatTime(entity.getLastFoundAt()),
                entity.getLatestSummary(),
                entity.getLatestEvidenceMarkdown(),
                entity.getLatestRun() == null ? null : entity.getLatestRun().getId(),
                entity.getLatestTarget() == null ? null : entity.getLatestTarget().getId(),
                workItem == null ? null : workItem.getId(),
                occurrences,
                workItem == null ? null : toWorkItemSummary(workItem)
        );
    }

    public SelfUpgradeWorkItemSummary toWorkItemSummary(SelfUpgradeWorkItemEntity entity) {
        return new SelfUpgradeWorkItemSummary(
                entity.getId(),
                entity.getSuggestion() == null ? null : entity.getSuggestion().getId(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getPriority(),
                entity.getStatus(),
                entity.getAssigneeUser() == null ? null : entity.getAssigneeUser().getId(),
                entity.getAssigneeUser() == null ? null : displayName(entity.getAssigneeUser()),
                entity.getRepositoryBindingsJson(),
                entity.getExecutionPrompt(),
                entity.getLatestExecutionTask() == null ? null : entity.getLatestExecutionTask().getId(),
                entity.getAcceptedByUser() == null ? null : entity.getAcceptedByUser().getId(),
                entity.getAcceptedByUser() == null ? null : displayName(entity.getAcceptedByUser()),
                formatTime(entity.getAcceptedAt()),
                formatTime(entity.getResolvedAt()),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt())
        );
    }

    private SelfUpgradeSuggestionOccurrenceSummary toOccurrenceSummary(SelfUpgradeSuggestionOccurrenceEntity entity) {
        List<SelfUpgradeArtifactLink> artifacts = new ArrayList<>();
        if (entity.getRun() != null && entity.getRun().getLinkedExecutionTask() != null && entity.getRun().getLinkedExecutionTask().getCurrentRun() != null) {
            Map<String, ExecutionArtifactEntity> artifactMap = new HashMap<>();
            for (ExecutionArtifactEntity artifact : executionArtifactRepository.findAllByRun_IdOrderByCreatedAtAscIdAsc(entity.getRun().getLinkedExecutionTask().getCurrentRun().getId())) {
                if (artifact.getContentRef() != null) {
                    artifactMap.put(artifact.getContentRef(), artifact);
                }
            }
            for (ArtifactRef ref : readArtifactRefs(entity.getExecutionArtifactRefsJson())) {
                ExecutionArtifactEntity executionArtifact = ref.contentRef() == null ? null : artifactMap.get(ref.contentRef());
                artifacts.add(new SelfUpgradeArtifactLink(
                        executionArtifact == null ? null : executionArtifact.getId(),
                        ref.artifactType(),
                        ref.title(),
                        ref.contentRef(),
                        ref.previewText(),
                        executionArtifact == null || executionArtifact.getId() == null ? null : "/api/execution-artifacts/" + executionArtifact.getId() + "/download"
                ));
            }
        }
        return new SelfUpgradeSuggestionOccurrenceSummary(
                entity.getId(),
                entity.getRun() == null ? null : entity.getRun().getId(),
                entity.getRunTarget() == null ? null : entity.getRunTarget().getId(),
                formatTime(entity.getFoundAt()),
                entity.getEvidenceMarkdown(),
                artifacts,
                entity.getPagePath(),
                entity.getDomHintJson()
        );
    }

    private Specification<SelfUpgradeSuggestionEntity> suggestionSpecification(String keyword,
                                                                              String status,
                                                                              String category,
                                                                              String severity) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), pattern),
                        cb.like(cb.lower(root.get("latestSummary")), pattern),
                        cb.like(cb.lower(root.get("latestEvidenceMarkdown")), pattern)
                ));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim().toUpperCase(Locale.ROOT)));
            }
            if (hasText(category)) {
                predicates.add(cb.equal(root.get("category"), category.trim().toUpperCase(Locale.ROOT)));
            }
            if (hasText(severity)) {
                predicates.add(cb.equal(root.get("severity"), severity.trim().toUpperCase(Locale.ROOT)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private void refreshActiveWorkItemContextIfNeeded(SelfUpgradeSuggestionEntity suggestion) {
        if (suggestion.getLinkedWorkItem() == null) {
            return;
        }
        SelfUpgradeWorkItemEntity workItem = suggestion.getLinkedWorkItem();
        if (!ACTIVE_WORK_ITEM_STATUSES.contains(normalizeCode(workItem.getStatus(), ""))) {
            return;
        }
        workItem.setDescription(buildWorkItemDescription(suggestion));
        workItem.setExecutionPrompt(buildExecutionPrompt(suggestion));
        workItemRepository.save(workItem);
    }

    private void sendSuggestionNotificationWithBot(SelfUpgradeSuggestionEntity suggestion, boolean reopened) {
        List<UserEntity> admins = userRepository.findDistinctByRoleCodeAndEnabledTrueOrderByIdAsc("SUPER_ADMIN");
        if (admins.isEmpty()) {
            return;
        }
        UserEntity botUser = selfUpgradeConfigService.requireSelfUpgradeBot();
        runAsUser(botUser, () -> notificationService.sendToUsers(
                admins.stream().map(UserEntity::getId).collect(java.util.stream.Collectors.toSet()),
                NotificationService.TYPE_SYSTEM,
                NotificationService.LEVEL_INFO,
                reopened ? "自升级建议已重开：" + suggestion.getTitle() : "发现新的自升级建议：" + suggestion.getTitle(),
                buildSuggestionNotificationContent(suggestion, reopened),
                "/self-upgrade?tab=suggestions",
                NOTIFICATION_BIZ_TYPE,
                suggestion.getId()
        ));
    }

    private void runAsUser(UserEntity user, Runnable runnable) {
        AuthContext previous = AuthContextHolder.get().orElse(null);
        try {
            AuthContextHolder.set(new AuthContext(
                    user.getId(),
                    user.getUsername(),
                    user.getNickname(),
                    user.getRoles().stream().map(role -> role.getCode()).collect(java.util.stream.Collectors.toSet()),
                    Set.of()
            ));
            runnable.run();
        } finally {
            if (previous == null) {
                AuthContextHolder.clear();
            } else {
                AuthContextHolder.set(previous);
            }
        }
    }

    private String buildSuggestionNotificationContent(SelfUpgradeSuggestionEntity suggestion, boolean reopened) {
        StringBuilder builder = new StringBuilder();
        builder.append(reopened ? "巡检再次命中了已关闭建议，已自动重开。" : "夜间巡检发现了新的优化建议。");
        builder.append("类别：").append(defaultString(suggestion.getCategory())).append("。");
        builder.append("严重级别：").append(defaultString(suggestion.getSeverity())).append("。");
        if (hasText(suggestion.getLatestSummary())) {
            builder.append("摘要：").append(limit(suggestion.getLatestSummary(), 160)).append("。");
        }
        builder.append("点击可进入自升级中心查看详情。");
        return builder.toString();
    }

    private String buildDefaultRepositoryBindingsJson() {
        String bindingIdsJson = selfUpgradeConfigService.requireCenterConfig().getDefaultRepositoryBindingIdsJson();
        List<Long> bindingIds;
        try {
            bindingIds = objectMapper.readValue(defaultString(bindingIdsJson), new TypeReference<List<Long>>() {
            });
        } catch (Exception exception) {
            throw new IllegalArgumentException("中心默认仓库绑定配置格式不正确", exception);
        }
        List<Map<String, Object>> repositories = new ArrayList<>();
        for (ProjectGitlabBindingEntity binding : projectGitlabBindingRepository.findAllById(bindingIds)) {
            repositories.add(Map.of(
                    "bindingId", binding.getId(),
                    "targetBranch", hasText(binding.getDefaultTargetBranch()) ? binding.getDefaultTargetBranch().trim() : "main"
            ));
        }
        try {
            return objectMapper.writeValueAsString(repositories);
        } catch (Exception exception) {
            throw new IllegalStateException("仓库绑定参数序列化失败", exception);
        }
    }

    private String buildWorkItemDescription(SelfUpgradeSuggestionEntity suggestion) {
        return """
                ## 建议摘要
                %s

                ## 最新证据
                %s
                """.formatted(
                defaultString(suggestion.getLatestSummary()).isBlank() ? "暂无摘要" : suggestion.getLatestSummary(),
                defaultString(suggestion.getLatestEvidenceMarkdown()).isBlank() ? "暂无证据" : suggestion.getLatestEvidenceMarkdown()
        ).trim();
    }

    private String buildExecutionPrompt(SelfUpgradeSuggestionEntity suggestion) {
        return """
                请修复平台自升级中心发现的问题，并严格围绕以下建议落地：

                标题：%s
                类别：%s
                严重级别：%s

                问题摘要：
                %s

                最新证据：
                %s

                要求：
                1. 优先给出可落地的代码改动
                2. 说明风险与验证方式
                3. 不要把建议回写到 Assistant
                """.formatted(
                suggestion.getTitle(),
                suggestion.getCategory(),
                suggestion.getSeverity(),
                defaultString(suggestion.getLatestSummary()),
                defaultString(suggestion.getLatestEvidenceMarkdown())
        ).trim();
    }

    private String mapPriority(String severity) {
        return switch (normalizeSeverity(severity)) {
            case "CRITICAL" -> "P0";
            case "HIGH" -> "P1";
            case "LOW" -> "P3";
            default -> "P2";
        };
    }

    private String buildFingerprint(SelfUpgradePatrolRunEntity run,
                                    String pagePath,
                                    String category,
                                    String title,
                                    String domHintJson) {
        String environmentCode = run.getEnvironmentProfile() == null ? "" : defaultString(run.getEnvironmentProfile().getCode()).trim().toUpperCase(Locale.ROOT);
        String normalizedTitle = defaultString(title).trim().toLowerCase(Locale.ROOT);
        String normalizedPagePath = defaultString(pagePath).trim().toLowerCase(Locale.ROOT);
        String normalizedDomHint = defaultString(domHintJson).trim().toLowerCase(Locale.ROOT);
        String raw = String.join("||", environmentCode, normalizedPagePath, category, normalizedTitle, normalizedDomHint);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte current : bytes) {
                builder.append(String.format("%02x", current));
            }
            return builder.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("建议指纹计算失败", exception);
        }
    }

    private String resolveArtifactRefsJson(JsonNode node, List<ExecutionArtifactEntity> executionArtifacts) {
        if (node != null && !node.isMissingNode() && node.isArray()) {
            try {
                return objectMapper.writeValueAsString(node);
            } catch (Exception exception) {
                throw new IllegalStateException("建议产物引用序列化失败", exception);
            }
        }
        List<Map<String, String>> fallback = executionArtifacts == null ? List.of() : executionArtifacts.stream()
                .filter(item -> item.getContentRef() != null)
                .map(item -> Map.of(
                        "artifactType", defaultString(item.getArtifactType()),
                        "title", defaultString(item.getTitle()),
                        "contentRef", defaultString(item.getContentRef()),
                        "previewText", defaultString(item.getContentText())
                ))
                .toList();
        try {
            return objectMapper.writeValueAsString(fallback);
        } catch (Exception exception) {
            throw new IllegalStateException("建议产物引用序列化失败", exception);
        }
    }

    private List<ArtifactRef> readArtifactRefs(String artifactRefsJson) {
        if (!hasText(artifactRefsJson)) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(artifactRefsJson);
            List<ArtifactRef> result = new ArrayList<>();
            if (node.isArray()) {
                for (JsonNode item : node) {
                    result.add(new ArtifactRef(
                            readText(item, "artifactType"),
                            readText(item, "title"),
                            readText(item, "contentRef"),
                            readText(item, "previewText")
                    ));
                }
            }
            return result;
        } catch (Exception exception) {
            return List.of();
        }
    }

    private SelfUpgradeSuggestionEntity requireSuggestion(Long suggestionId) {
        return suggestionRepository.findById(suggestionId)
                .orElseThrow(() -> new NoSuchElementException("优化建议不存在: " + suggestionId));
    }

    private UserEntity requireCurrentUser() {
        Long userId = AuthContextHolder.get()
                .map(AuthContext::userId)
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
        return userRepository.findWithDetailsById(userId)
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在: " + userId));
    }

    private String requireFindingText(JsonNode node, String fieldName, String message) {
        String value = trimToNull(readText(node, fieldName));
        if (value == null) {
            throw new IllegalArgumentException(message);
        }
        return value;
    }

    private String normalizeSeverity(String severity) {
        String normalized = normalizeCode(severity, "MEDIUM");
        return switch (normalized) {
            case "CRITICAL", "HIGH", "MEDIUM", "LOW" -> normalized;
            default -> "MEDIUM";
        };
    }

    private String normalizePagePath(String pagePath, String fallback) {
        String normalized = trimToNull(pagePath);
        if (normalized != null) {
            return normalized;
        }
        return trimToNull(fallback);
    }

    private String normalizeDomHint(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "{}";
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception exception) {
            return "{}";
        }
    }

    private String readText(JsonNode node, String fieldName) {
        if (node == null) {
            return "";
        }
        JsonNode child = node.path(fieldName);
        return child.isMissingNode() || child.isNull() ? "" : child.asText("");
    }

    private String normalizeCode(String value, String fallback) {
        String normalized = trimToNull(value);
        return normalized == null ? fallback : normalized.trim().toUpperCase(Locale.ROOT);
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String displayName(UserEntity user) {
        String nickname = defaultString(user.getNickname()).trim();
        return nickname.isBlank() ? user.getUsername() : nickname;
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value);
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (!hasText(value)) {
            return null;
        }
        return value.trim();
    }

    public record IngestOutcome(
            SelfUpgradeSuggestionEntity suggestion,
            boolean opened,
            boolean reopened
    ) {
    }

    private record ArtifactRef(
            String artifactType,
            String title,
            String contentRef,
            String previewText
    ) {
    }
}
