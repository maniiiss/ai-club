package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.BatchRequirementAiOperationItem;
import com.aiclub.platform.dto.request.BatchRequirementAiRequest;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.CreditConsumptionService;
import com.aiclub.platform.service.RequirementAiExecutionQueryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 公众端需求 AI 助手接口。
 * 与内部管理端共用执行中心创建链路，并通过 CreditConsumptionService 在创建任务前扣减积分。
 * 当前业务键保证每次主动提交独立计费，任务创建失败由扣费服务回滚。
 * <p>
 * 积分功能编码约定：
 * <ul>
 *   <li>REQUIREMENT_AI — 标准化需求、拆解子任务</li>
 *   <li>TEST_CASE_AI — 测试用例生成</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/public/tasks")
public class PublicRequirementAiController {

    /** 标准化需求 / 拆解子任务对应的积分功能编码。 */
    private static final String FEATURE_REQUIREMENT_AI = "REQUIREMENT_AI";

    /** 测试用例生成对应的积分功能编码。 */
    private static final String FEATURE_TEST_CASE_AI = "TEST_CASE_AI";

    /** 动作中文名映射，用于积分流水原因描述。 */
    private static final Map<String, String> ACTION_LABELS = Map.of(
            "STANDARDIZE", "标准化需求",
            "BREAKDOWN", "拆解子任务",
            "TEST_CASES", "生成测试用例"
    );

    private final RequirementAiExecutionQueryService requirementAiExecutionQueryService;
    private final CreditConsumptionService creditConsumptionService;

    public PublicRequirementAiController(RequirementAiExecutionQueryService requirementAiExecutionQueryService,
                                         CreditConsumptionService creditConsumptionService) {
        this.requirementAiExecutionQueryService = requirementAiExecutionQueryService;
        this.creditConsumptionService = creditConsumptionService;
    }

    /**
     * 公众端 AI 生成接口，根据 action 匹配对应的积分功能编码并扣费后创建后台执行任务。
     */
    @PostMapping("/{id}/requirement-ai")
    @RequirePermission("task:view")
    public ApiResponse<ExecutionTaskSummary> generateRequirementAi(
            @PathVariable Long id,
            @Valid @RequestBody TaskRequirementAiRequest request) {

        Long userId = currentUserId();
        String action = request.action();
        String featureCode = resolveFeatureCode(action);
        String businessKey = buildBusinessKey(userId, id, action);
        String reason = "需求AI助手：" + ACTION_LABELS.getOrDefault(action, action);

        ExecutionTaskSummary result = creditConsumptionService.consumeForFeature(
                userId, featureCode, businessKey, reason,
                () -> requirementAiExecutionQueryService.create(id, request, true)
        );
        return ApiResponse.success(result);
    }

    /**
     * 公众端批量需求 AI 创建入口。
     * 一个请求内完成整批提交，服务端逐项扣费与创建任务，单项失败不会撤销已成功创建的任务。
     */
    @PostMapping("/batch-requirement-ai")
    @RequirePermission("task:view")
    public ApiResponse<List<BatchRequirementAiOperationItem>> generateBatchRequirementAi(
            @Valid @RequestBody BatchRequirementAiRequest request) {

        String action = request.action().trim();
        if (!"STANDARDIZE".equals(action) && !"BREAKDOWN".equals(action)) {
            throw new IllegalArgumentException("批量需求 AI 仅支持标准化需求或拆解子任务");
        }
        Long userId = currentUserId();
        List<BatchRequirementAiOperationItem> results = new ArrayList<>();
        for (Long taskId : new LinkedHashSet<>(request.taskIds())) {
            try {
                ExecutionTaskSummary executionTask = creditConsumptionService.consumeForFeature(
                        userId,
                        FEATURE_REQUIREMENT_AI,
                        buildBusinessKey(userId, taskId, action),
                        "需求AI助手：" + ACTION_LABELS.get(action),
                        () -> requirementAiExecutionQueryService.create(
                                taskId,
                                new TaskRequirementAiRequest(action, null),
                                true)
                );
                results.add(new BatchRequirementAiOperationItem(taskId, executionTask, null));
            } catch (RuntimeException exception) {
                results.add(new BatchRequirementAiOperationItem(taskId, null, failureMessage(exception)));
            }
        }
        return ApiResponse.success(results);
    }

    private String resolveFeatureCode(String action) {
        if ("TEST_CASES".equals(action)) {
            return FEATURE_TEST_CASE_AI;
        }
        return FEATURE_REQUIREMENT_AI;
    }

    private String buildBusinessKey(Long userId, Long taskId, String action) {
        // 使用时间戳确保每次调用生成独立的业务键，避免幂等机制阻止正常重复调用。
        return "req-ai:" + userId + ":" + taskId + ":" + action + ":" + System.currentTimeMillis();
    }

    private Long currentUserId() {
        return AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    private String failureMessage(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "创建任务失败" : message;
    }
}
