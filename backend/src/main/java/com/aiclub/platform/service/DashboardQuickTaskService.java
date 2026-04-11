package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserDashboardQuickTaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DashboardQuickTaskSummary;
import com.aiclub.platform.dto.request.SaveDashboardQuickTaskItemRequest;
import com.aiclub.platform.dto.request.SaveDashboardQuickTasksRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.UserDashboardQuickTaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理首页快捷任务的用户级持久化读写。
 */
@Service
@Transactional(readOnly = true)
public class DashboardQuickTaskService {

    private final UserDashboardQuickTaskRepository userDashboardQuickTaskRepository;
    private final UserRepository userRepository;

    public DashboardQuickTaskService(UserDashboardQuickTaskRepository userDashboardQuickTaskRepository,
                                     UserRepository userRepository) {
        this.userDashboardQuickTaskRepository = userDashboardQuickTaskRepository;
        this.userRepository = userRepository;
    }

    /**
     * 读取当前登录用户的快捷任务列表。
     */
    public List<DashboardQuickTaskSummary> listCurrentUserQuickTasks() {
        return userDashboardQuickTaskRepository.findAllByUser_IdOrderBySortOrderAscIdAsc(requireCurrentUserId())
                .stream()
                .map((entity) -> toSummary(entity, buildFallbackClientKey(entity.getId())))
                .toList();
    }

    /**
     * 用前端提交的最新列表覆盖当前用户的快捷任务，并保留已有条目的稳定ID。
     */
    @Transactional
    public List<DashboardQuickTaskSummary> saveCurrentUserQuickTasks(SaveDashboardQuickTasksRequest request) {
        Long currentUserId = requireCurrentUserId();
        UserEntity currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        List<UserDashboardQuickTaskEntity> existingTasks = userDashboardQuickTaskRepository.findAllByUser_IdOrderBySortOrderAscIdAsc(currentUserId);
        Map<Long, UserDashboardQuickTaskEntity> existingTaskMap = new LinkedHashMap<>();
        existingTasks.forEach((task) -> {
            if (task.getId() != null) {
                existingTaskMap.put(task.getId(), task);
            }
        });

        List<UserDashboardQuickTaskEntity> savingTasks = new ArrayList<>();
        List<String> responseClientKeys = new ArrayList<>();
        for (int index = 0; index < request.items().size(); index++) {
            SaveDashboardQuickTaskItemRequest itemRequest = request.items().get(index);
            String normalizedContent = normalizeContent(itemRequest.content());
            if (normalizedContent.isBlank()) {
                continue;
            }

            UserDashboardQuickTaskEntity targetTask = resolveTargetTask(itemRequest, existingTaskMap, currentUser);
            targetTask.setContent(normalizedContent);
            targetTask.setChecked(Boolean.TRUE.equals(itemRequest.checked()));
            targetTask.setSortOrder(index);
            savingTasks.add(targetTask);
            responseClientKeys.add(normalizeClientKey(itemRequest.clientKey()));
        }

        if (!existingTaskMap.isEmpty()) {
            userDashboardQuickTaskRepository.deleteAll(existingTaskMap.values());
        }

        userDashboardQuickTaskRepository.saveAll(savingTasks);
        savingTasks.sort(Comparator.comparing(UserDashboardQuickTaskEntity::getSortOrder).thenComparing(UserDashboardQuickTaskEntity::getId));

        List<DashboardQuickTaskSummary> summaries = new ArrayList<>();
        for (int index = 0; index < savingTasks.size(); index++) {
            UserDashboardQuickTaskEntity entity = savingTasks.get(index);
            String clientKey = responseClientKeys.size() > index ? responseClientKeys.get(index) : buildFallbackClientKey(entity.getId());
            summaries.add(toSummary(entity, clientKey));
        }
        return summaries;
    }

    /**
     * 根据请求里的ID解析目标实体：
     * 1. 传了合法ID则更新原记录；
     * 2. 未传ID则创建新记录；
     * 3. 传了不属于当前用户的ID则直接拒绝，避免越权覆盖他人数据。
     */
    private UserDashboardQuickTaskEntity resolveTargetTask(SaveDashboardQuickTaskItemRequest itemRequest,
                                                           Map<Long, UserDashboardQuickTaskEntity> existingTaskMap,
                                                           UserEntity currentUser) {
        if (itemRequest.id() == null) {
            UserDashboardQuickTaskEntity entity = new UserDashboardQuickTaskEntity();
            entity.setUser(currentUser);
            return entity;
        }

        UserDashboardQuickTaskEntity existingTask = existingTaskMap.remove(itemRequest.id());
        if (existingTask == null) {
            throw new IllegalArgumentException("快捷任务不存在或无权访问");
        }
        return existingTask;
    }

    /**
     * 统一清洗文本，避免前后端对空白字符的判断出现偏差。
     */
    private String normalizeContent(String content) {
        return content == null ? "" : content.trim();
    }

    /**
     * 清洗前端草稿键；如果没有传值，则回退到可复现的ID键。
     */
    private String normalizeClientKey(String clientKey) {
        String normalizedClientKey = clientKey == null ? "" : clientKey.trim();
        return normalizedClientKey.isBlank() ? "" : normalizedClientKey;
    }

    /**
     * 为后端直接返回的数据生成一个稳定可回用的默认草稿键。
     */
    private String buildFallbackClientKey(Long taskId) {
        return taskId == null ? "" : "server-" + taskId;
    }

    /**
     * 从线程上下文里提取当前登录用户ID。
     */
    private Long requireCurrentUserId() {
        return AuthContextHolder.get()
                .map(AuthContext::userId)
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    /**
     * 转成前端消费的轻量摘要对象。
     */
    private DashboardQuickTaskSummary toSummary(UserDashboardQuickTaskEntity entity, String clientKey) {
        return new DashboardQuickTaskSummary(
                entity.getId(),
                clientKey.isBlank() ? buildFallbackClientKey(entity.getId()) : clientKey,
                entity.getContent(),
                entity.isChecked(),
                entity.getSortOrder()
        );
    }
}
