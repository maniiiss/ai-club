package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesGroundingState;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Hermes 写操作动作规划服务。
 * Hermes 通过 write tool call 表达意图，平台负责把它们安全映射成待确认动作卡片。
 */
@Service
public class HermesActionPlannerService {

    public static final String ACTION_CREATE_EXECUTION_TASK = "CREATE_EXECUTION_TASK";
    public static final String ACTION_CREATE_REPOSITORY_SCAN_TASK = "CREATE_REPOSITORY_SCAN_TASK";

    /**
     * 将 Hermes 发起的写工具调用转换为前端可执行的确认卡片。
     */
    public HermesActionSummary createActionFromToolCall(String toolCode,
                                                        Map<String, Object> arguments,
                                                        HermesGroundingState groundingState,
                                                        String userQuestion) {
        Map<String, Object> safeArguments = arguments == null ? Map.of() : arguments;
        return switch (toolCode) {
            case PlatformToolRegistry.TOOL_REPO_SCAN_START -> createRepositoryScanAction(safeArguments, groundingState);
            case PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE -> createExecutionAction(safeArguments, groundingState, userQuestion);
            case PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT -> createWorkItemAction(safeArguments, groundingState);
            case PlatformToolRegistry.TOOL_TEST_PLAN_CREATE_DRAFT -> createTestPlanAction(safeArguments, groundingState);
            default -> null;
        };
    }

    /**
     * 生成仓库规范扫描任务创建动作卡片。
     * 这里优先复用当前会话中已绑定的仓库对象，避免 Hermes 为了补齐 bindingId 再要求用户输入内部 ID。
     */
    private HermesActionSummary createRepositoryScanAction(Map<String, Object> arguments,
                                                           HermesGroundingState groundingState) {
        Long bindingId = resolveLong(arguments.get("bindingId"));
        if (bindingId == null && groundingState != null && groundingState.boundSlot("gitlabBinding") != null) {
            bindingId = groundingState.boundSlot("gitlabBinding").entityId();
        }
        String rulesetCode = defaultString(arguments.get("rulesetCode"), "");
        if (bindingId == null || rulesetCode.isBlank()) {
            return null;
        }

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("bindingId", bindingId);
        params.put("branch", defaultString(arguments.get("branch"), ""));
        params.put("rulesetCode", rulesetCode);
        return new HermesActionSummary(
                ACTION_CREATE_REPOSITORY_SCAN_TASK,
                "发起仓库扫描",
                "确认后会基于当前仓库绑定创建一条仓库规范扫描任务。",
                true,
                params
        );
    }

    /**
     * 生成执行中心任务创建动作卡片。
     */
    private HermesActionSummary createExecutionAction(Map<String, Object> arguments,
                                                      HermesGroundingState groundingState,
                                                      String userQuestion) {
        Long projectId = resolveLong(arguments.get("projectId"));
        Long workItemId = resolveLong(arguments.get("workItemId"));
        if (projectId == null && groundingState != null && groundingState.boundSlot("project") != null) {
            projectId = groundingState.boundSlot("project").entityId();
        }
        if (workItemId == null && groundingState != null && groundingState.boundSlot("workItem") != null) {
            workItemId = groundingState.boundSlot("workItem").entityId();
        }
        if (projectId == null || workItemId == null) {
            return null;
        }

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("scenarioCode", defaultString(arguments.get("scenarioCode"), ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION));
        params.put("projectId", projectId);
        params.put("workItemId", workItemId);
        params.put("triggerSource", "HERMES");

        Map<String, Object> inputPayload = new LinkedHashMap<>();
        inputPayload.put("userQuestion", defaultString(userQuestion, ""));
        params.put("inputPayload", inputPayload);

        return new HermesActionSummary(
                ACTION_CREATE_EXECUTION_TASK,
                "发起执行任务",
                "确认后会基于当前工作项创建一个执行中心任务。",
                true,
                params
        );
    }

    /**
     * 生成工作项草稿创建动作卡片。
     */
    private HermesActionSummary createWorkItemAction(Map<String, Object> arguments,
                                                     HermesGroundingState groundingState) {
        Long projectId = resolveLong(arguments.get("projectId"));
        if (projectId == null && groundingState != null && groundingState.boundSlot("project") != null) {
            projectId = groundingState.boundSlot("project").entityId();
        }
        if (projectId == null) {
            return null;
        }

        String workItemType = defaultString(arguments.get("workItemType"), "需求");
        String content = defaultString(arguments.get("content"), "");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("projectId", projectId);
        params.put("iterationId", resolveLong(arguments.get("iterationId")));
        params.put("workItemType", workItemType);
        params.put("name", defaultString(arguments.get("name"), buildTitle(content, workItemType)));
        params.put("content", content);
        Long assigneeUserId = resolveLong(arguments.get("assigneeUserId"));
        if (assigneeUserId != null) {
            params.put("assigneeUserId", assigneeUserId);
        }
        return new HermesActionSummary(
                "CREATE_WORK_ITEM_DRAFT",
                "创建" + workItemType + "草稿",
                "确认后会在当前项目下创建一个“" + workItemType + "”草稿。",
                true,
                params
        );
    }

    /**
     * 生成测试计划草稿创建动作卡片。
     */
    private HermesActionSummary createTestPlanAction(Map<String, Object> arguments,
                                                     HermesGroundingState groundingState) {
        Long projectId = resolveLong(arguments.get("projectId"));
        if (projectId == null && groundingState != null && groundingState.boundSlot("project") != null) {
            projectId = groundingState.boundSlot("project").entityId();
        }
        Long iterationId = resolveLong(arguments.get("iterationId"));
        if (iterationId == null && groundingState != null && groundingState.boundSlot("iteration") != null) {
            iterationId = groundingState.boundSlot("iteration").entityId();
        }
        if (projectId == null || iterationId == null) {
            return null;
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("projectId", projectId);
        params.put("iterationId", iterationId);
        params.put("name", defaultString(arguments.get("name"), "Hermes 测试计划草稿"));
        params.put("description", defaultString(arguments.get("description"), "由 Hermes 根据当前上下文创建的测试计划草稿。"));
        return new HermesActionSummary(
                "CREATE_TEST_PLAN_DRAFT",
                "创建测试计划草稿",
                "确认后会在当前迭代下创建测试计划草稿。",
                true,
                params
        );
    }

    private String buildTitle(String content, String workItemType) {
        String normalized = defaultString(content, "").replaceAll("\\s+", " ").trim();
        if (normalized.isBlank()) {
            return "Hermes 创建的" + workItemType + "草稿";
        }
        return normalized.length() > 40 ? normalized.substring(0, 40) : normalized;
    }

    private Long resolveLong(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String defaultString(Object value, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        return String.valueOf(value).trim();
    }
}
