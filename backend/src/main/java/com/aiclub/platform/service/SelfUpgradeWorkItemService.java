package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.SelfUpgradeSuggestionEntity;
import com.aiclub.platform.domain.model.SelfUpgradeWorkItemEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.SelfUpgradeWorkItemSummary;
import com.aiclub.platform.dto.request.SelfUpgradeWorkItemCompleteRequest;
import com.aiclub.platform.dto.request.SelfUpgradeWorkItemUpdateRequest;
import com.aiclub.platform.repository.SelfUpgradeSuggestionRepository;
import com.aiclub.platform.repository.SelfUpgradeWorkItemRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.NoSuchElementException;

/**
 * 自升级整改工作项服务。
 * 工作项是建议接受后的中心内载体，用户需要手动发起整改执行并手动收口状态。
 */
@Service
@Transactional(readOnly = true)
public class SelfUpgradeWorkItemService {

    private final SelfUpgradeWorkItemRepository workItemRepository;
    private final SelfUpgradeSuggestionRepository suggestionRepository;
    private final SelfUpgradeSuggestionService suggestionService;
    private final SelfUpgradeExecutionBridgeService executionBridgeService;
    private final UserRepository userRepository;

    public SelfUpgradeWorkItemService(SelfUpgradeWorkItemRepository workItemRepository,
                                      SelfUpgradeSuggestionRepository suggestionRepository,
                                      SelfUpgradeSuggestionService suggestionService,
                                      SelfUpgradeExecutionBridgeService executionBridgeService,
                                      UserRepository userRepository) {
        this.workItemRepository = workItemRepository;
        this.suggestionRepository = suggestionRepository;
        this.suggestionService = suggestionService;
        this.executionBridgeService = executionBridgeService;
        this.userRepository = userRepository;
    }

    public SelfUpgradeWorkItemSummary getWorkItem(Long workItemId) {
        return suggestionService.toWorkItemSummary(requireWorkItem(workItemId));
    }

    @Transactional
    public SelfUpgradeWorkItemSummary updateWorkItem(Long workItemId, SelfUpgradeWorkItemUpdateRequest request) {
        SelfUpgradeWorkItemEntity entity = requireWorkItem(workItemId);
        entity.setTitle(request.title().trim());
        entity.setDescription(request.description() == null ? "" : request.description().trim());
        entity.setPriority(normalizePriority(request.priority()));
        entity.setStatus(normalizeStatus(request.status()));
        entity.setAssigneeUser(request.assigneeUserId() == null ? null : requireUser(request.assigneeUserId()));
        entity.setRepositoryBindingsJson(request.repositoryBindingsJson() == null ? "[]" : request.repositoryBindingsJson().trim());
        entity.setExecutionPrompt(request.executionPrompt() == null ? "" : request.executionPrompt().trim());
        if ("DONE".equals(entity.getStatus())) {
            entity.setResolvedAt(LocalDateTime.now());
            syncSuggestionStatus(entity.getSuggestion(), "RESOLVED");
        } else if ("CANCELED".equals(entity.getStatus())) {
            syncSuggestionStatus(entity.getSuggestion(), "REJECTED");
        } else if ("RUNNING".equals(entity.getStatus()) || "VERIFYING".equals(entity.getStatus())) {
            syncSuggestionStatus(entity.getSuggestion(), "IN_PROGRESS");
        } else {
            syncSuggestionStatus(entity.getSuggestion(), "ACCEPTED");
        }
        return suggestionService.toWorkItemSummary(workItemRepository.save(entity));
    }

    @Transactional
    public SelfUpgradeWorkItemSummary startExecution(Long workItemId) {
        SelfUpgradeWorkItemEntity entity = requireWorkItem(workItemId);
        UserEntity currentUser = requireCurrentUser();
        executionBridgeService.startWorkItemExecution(entity, currentUser);
        syncSuggestionStatus(entity.getSuggestion(), "IN_PROGRESS");
        return suggestionService.toWorkItemSummary(requireWorkItem(workItemId));
    }

    @Transactional
    public SelfUpgradeWorkItemSummary completeWorkItem(Long workItemId, SelfUpgradeWorkItemCompleteRequest request) {
        SelfUpgradeWorkItemEntity entity = requireWorkItem(workItemId);
        String status = normalizeStatus(request.status());
        entity.setStatus(status);
        if ("DONE".equals(status)) {
            entity.setResolvedAt(LocalDateTime.now());
            syncSuggestionStatus(entity.getSuggestion(), "RESOLVED");
        } else if ("CANCELED".equals(status)) {
            syncSuggestionStatus(entity.getSuggestion(), "REJECTED");
        } else if ("RUNNING".equals(status) || "VERIFYING".equals(status)) {
            syncSuggestionStatus(entity.getSuggestion(), "IN_PROGRESS");
        }
        return suggestionService.toWorkItemSummary(workItemRepository.save(entity));
    }

    public SelfUpgradeWorkItemEntity requireWorkItem(Long workItemId) {
        return workItemRepository.findById(workItemId)
                .orElseThrow(() -> new NoSuchElementException("自升级工作项不存在: " + workItemId));
    }

    private void syncSuggestionStatus(SelfUpgradeSuggestionEntity suggestion, String status) {
        if (suggestion == null) {
            return;
        }
        suggestion.setStatus(status);
        suggestionRepository.save(suggestion);
    }

    private UserEntity requireUser(Long userId) {
        return userRepository.findWithDetailsById(userId)
                .orElseThrow(() -> new NoSuchElementException("用户不存在: " + userId));
    }

    private UserEntity requireCurrentUser() {
        Long userId = AuthContextHolder.get()
                .map(AuthContext::userId)
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
        return requireUser(userId);
    }

    private String normalizeStatus(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "TODO", "RUNNING", "VERIFYING", "DONE", "CANCELED" -> normalized;
            default -> throw new IllegalArgumentException("工作项状态不合法");
        };
    }

    private String normalizePriority(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "P0", "P1", "P2", "P3" -> normalized;
            default -> throw new IllegalArgumentException("工作项优先级不合法");
        };
    }
}
