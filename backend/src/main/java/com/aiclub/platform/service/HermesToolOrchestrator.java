package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesToolContext;
import com.aiclub.platform.dto.PlatformToolAction;
import com.aiclub.platform.dto.PlatformToolCandidate;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.request.HermesChatRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Hermes 工具编排服务。
 * 第一版由平台侧规则决定是否自动执行只读工具，再把结果转成候选卡片和确认动作。
 */
@Service
public class HermesToolOrchestrator {

    private final PlatformToolExecutor platformToolExecutor;

    public HermesToolOrchestrator(PlatformToolExecutor platformToolExecutor) {
        this.platformToolExecutor = platformToolExecutor;
    }

    public HermesToolContext planAndRunReadTools(HermesChatRequest request,
                                                 HermesContextAssembler.HermesConversationContext context,
                                                 String scopeKey) {
        List<PlatformToolResult> toolResults = new ArrayList<>();
        List<HermesActionSummary> actions = new ArrayList<>();
        String question = defaultString(request.question());
        Long projectId = context.projectId() != null ? context.projectId() : request.projectId();

        if (isExecutionIntent(question)) {
            if (context.taskId() != null && projectId != null) {
                actions.add(executionAction("发起开发执行", "基于当前工作项创建开发执行任务。", projectId, context.taskId(), question));
            } else {
                PlatformToolResult workItemSearch = safeExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH, scopeKey, projectId, Map.of(
                        "keyword", extractWorkItemKeyword(question),
                        "workItemType", "需求",
                        "projectId", projectId == null ? "" : projectId
                ));
                if (workItemSearch != null) {
                    toolResults.add(workItemSearch);
                    if (workItemSearch.candidates().size() == 1) {
                        PlatformToolCandidate candidate = workItemSearch.candidates().get(0);
                        Object candidateProjectId = candidate.payload().get("projectId");
                        actions.add(executionAction(
                                "针对 “" + candidate.title() + "” 发起开发执行",
                                "已唯一匹配到工作项，确认后创建开发执行任务。",
                                Long.parseLong(String.valueOf(candidateProjectId)),
                                candidate.id(),
                                question
                        ));
                    }
                }
            }
        }

        if (isCreateWorkItemIntent(question) && projectId != null) {
            String memberKeyword = extractAssigneeKeyword(question);
            Long assigneeUserId = null;
            if (!memberKeyword.isBlank()) {
                PlatformToolResult memberResult = safeExecute(PlatformToolRegistry.TOOL_USER_RESOLVE_PROJECT_MEMBER, scopeKey, projectId, Map.of(
                        "projectId", projectId,
                        "keyword", memberKeyword
                ));
                if (memberResult != null) {
                    toolResults.add(memberResult);
                    if (memberResult.candidates().size() == 1) {
                        assigneeUserId = memberResult.candidates().get(0).id();
                    }
                }
            }
            actions.add(createWorkItemAction(projectId, request.iterationId(), inferWorkItemType(question), extractWorkItemContent(question), assigneeUserId));
        }

        if (isExecutionSearchIntent(question)) {
            PlatformToolResult executionResult = safeExecute(PlatformToolRegistry.TOOL_EXECUTION_TASK_SEARCH, scopeKey, projectId, Map.of(
                    "projectId", projectId == null ? "" : projectId,
                    "status", question.contains("失败") ? "FAILED" : "",
                    "keyword", extractLooseKeyword(question)
            ));
            if (executionResult != null) {
                toolResults.add(executionResult);
            }
        }

        if (isTestPlanSearchIntent(question)) {
            PlatformToolResult testPlanResult = safeExecute(PlatformToolRegistry.TOOL_TEST_PLAN_SEARCH, scopeKey, projectId, Map.of(
                    "projectId", projectId == null ? "" : projectId,
                    "iterationId", request.iterationId() == null ? "" : request.iterationId(),
                    "keyword", extractLooseKeyword(question)
            ));
            if (testPlanResult != null) {
                toolResults.add(testPlanResult);
            }
        }

        if (isCreateTestPlanIntent(question) && projectId != null && request.iterationId() != null) {
            actions.add(createTestPlanAction(projectId, request.iterationId(), extractTestPlanName(question)));
        }

        return new HermesToolContext(toolResults, actions, buildToolContextMarkdown(toolResults));
    }

    private PlatformToolResult safeExecute(String toolCode, String scopeKey, Long projectId, Map<String, Object> payload) {
        try {
            return platformToolExecutor.execute(new PlatformToolRequest(toolCode, "HERMES", scopeKey, projectId, null, null, payload));
        } catch (RuntimeException exception) {
            return new PlatformToolResult(
                    toolCode,
                    toolCode,
                    "工具调用失败：" + defaultString(exception.getMessage()),
                    List.of(),
                    List.of(),
                    Map.of("failed", true)
            );
        }
    }

    private HermesActionSummary executionAction(String title, String description, Long projectId, Long workItemId, String question) {
        Map<String, Object> inputPayload = new LinkedHashMap<>();
        inputPayload.put("userQuestion", question);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("scenarioCode", ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        params.put("projectId", projectId);
        params.put("workItemId", workItemId);
        params.put("triggerSource", "HERMES");
        params.put("inputPayload", inputPayload);
        return new HermesActionSummary("CREATE_EXECUTION_TASK", title, description, true, params);
    }

    private HermesActionSummary createWorkItemAction(Long projectId,
                                                     Long iterationId,
                                                     String workItemType,
                                                     String content,
                                                     Long assigneeUserId) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("projectId", projectId);
        params.put("iterationId", iterationId);
        params.put("workItemType", workItemType);
        params.put("name", buildTitle(content, workItemType));
        params.put("content", content);
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

    private HermesActionSummary createTestPlanAction(Long projectId, Long iterationId, String name) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("projectId", projectId);
        params.put("iterationId", iterationId);
        params.put("name", name);
        params.put("description", "由 Hermes 根据当前上下文创建的测试计划草稿。");
        return new HermesActionSummary("CREATE_TEST_PLAN_DRAFT", "创建测试计划草稿", "确认后会在当前迭代下创建测试计划草稿。", true, params);
    }

    private String buildToolContextMarkdown(List<PlatformToolResult> toolResults) {
        if (toolResults == null || toolResults.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("\n\n## 平台工具自动查询结果\n");
        for (PlatformToolResult result : toolResults) {
            builder.append("- 工具：").append(result.toolName()).append("，结果：").append(result.summary()).append('\n');
            for (PlatformToolCandidate candidate : result.candidates().stream().limit(5).toList()) {
                builder.append("  - ")
                        .append(candidate.type())
                        .append(" #")
                        .append(candidate.id())
                        .append("：")
                        .append(candidate.title())
                        .append(" / ")
                        .append(defaultString(candidate.subtitle()))
                        .append('\n');
            }
        }
        return builder.toString();
    }

    private boolean isExecutionIntent(String question) {
        String normalized = normalize(question);
        return containsAny(normalized, "发起开发", "开发执行", "开始开发", "实现这个需求", "编码实现", "执行任务");
    }

    private boolean isExecutionSearchIntent(String question) {
        String normalized = normalize(question);
        return containsAny(normalized, "失败的智能体", "执行任务", "执行中心", "智能体任务") && containsAny(normalized, "查", "哪些", "总结", "失败");
    }

    private boolean isCreateWorkItemIntent(String question) {
        String normalized = normalize(question);
        return containsAny(normalized, "创建", "新建") && containsAny(normalized, "需求", "任务", "缺陷", "工作项");
    }

    private boolean isTestPlanSearchIntent(String question) {
        String normalized = normalize(question);
        return containsAny(normalized, "测试计划", "测试用例") && containsAny(normalized, "查", "哪些", "列表", "详情");
    }

    private boolean isCreateTestPlanIntent(String question) {
        String normalized = normalize(question);
        return containsAny(normalized, "创建", "新建") && containsAny(normalized, "测试计划");
    }

    private String inferWorkItemType(String question) {
        if (question.contains("缺陷")) {
            return "缺陷";
        }
        if (question.contains("任务")) {
            return "任务";
        }
        return "需求";
    }

    private String extractWorkItemKeyword(String question) {
        String result = defaultString(question)
                .replaceAll("帮我|请|针对|这个需求|该需求|需求|发起开发执行任务|发起开发|开发执行|开始开发|实现", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return result.isBlank() ? defaultString(question).trim() : result;
    }

    private String extractLooseKeyword(String question) {
        return defaultString(question)
                .replaceAll("帮我|请|查一下|查|哪些|最近|失败的|执行任务|智能体任务|测试计划", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String extractAssigneeKeyword(String question) {
        String normalized = defaultString(question);
        int index = Math.max(normalized.indexOf("派给"), normalized.indexOf("指派给"));
        if (index < 0) {
            return "";
        }
        return normalized.substring(index)
                .replaceFirst("指派给|派给", "")
                .replaceAll("[，。,.;；].*$", "")
                .trim();
    }

    private String extractWorkItemContent(String question) {
        String normalized = defaultString(question);
        int index = normalized.indexOf("内容是");
        if (index >= 0) {
            return normalized.substring(index + "内容是".length())
                    .replaceAll("派给.*$", "")
                    .trim();
        }
        return normalized.replaceAll("帮我|请|创建|新建|一个|需求|任务|缺陷|工作项", " ")
                .replaceAll("派给.*$", "")
                .trim();
    }

    private String extractTestPlanName(String question) {
        String result = defaultString(question)
                .replaceAll("帮我|请|创建|新建|一个|测试计划|给这个迭代|给当前迭代", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return result.isBlank() ? "Hermes 测试计划草稿" : result;
    }

    private String buildTitle(String content, String workItemType) {
        String normalized = defaultString(content).replaceAll("\\s+", " ").trim();
        if (normalized.isBlank()) {
            return "Hermes 创建的" + workItemType + "草稿";
        }
        return normalized.length() > 40 ? normalized.substring(0, 40) : normalized;
    }

    private boolean containsAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private String normalize(String value) {
        return defaultString(value).toLowerCase(Locale.ROOT);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
