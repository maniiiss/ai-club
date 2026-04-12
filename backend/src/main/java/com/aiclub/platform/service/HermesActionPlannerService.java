package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Hermes 动作规划服务。
 * 第一版优先通过规则识别“发起执行任务”类意图，避免把业务写操作直接交给模型自由发挥。
 */
@Service
public class HermesActionPlannerService {

    public static final String ACTION_CREATE_EXECUTION_TASK = "CREATE_EXECUTION_TASK";

    /**
     * 根据当前问题与上下文提取可执行动作。
     * 第一版仅在当前工作项上下文中给出执行中心任务创建动作。
     */
    public List<HermesActionSummary> planActions(HermesChatRequest request,
                                                 HermesContextAssembler.HermesConversationContext context) {
        if (request == null || context == null || context.taskId() == null || context.projectId() == null) {
            return List.of();
        }

        String normalizedQuestion = normalize(request.question());
        if (normalizedQuestion.isBlank()) {
            return List.of();
        }

        if (containsAny(normalizedQuestion, "需求拆解", "拆解需求", "拆成任务", "需求分解")) {
            return List.of(buildExecutionAction(
                    "发起需求拆解",
                    "基于当前工作项创建一个“需求拆解”执行任务。",
                    context.projectId(),
                    context.taskId(),
                    ExecutionWorkflowService.SCENARIO_REQUIREMENT_BREAKDOWN,
                    request.question()
            ));
        }
        if (containsAny(normalizedQuestion, "开发执行", "开始开发", "开发任务", "实现这个需求", "编码实现")) {
            return List.of(buildExecutionAction(
                    "发起开发执行",
                    "基于当前工作项创建一个“开发执行”多步骤任务。",
                    context.projectId(),
                    context.taskId(),
                    ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                    request.question()
            ));
        }
        if (containsAny(normalizedQuestion, "测试设计", "测试方案", "测试执行", "评审", "review", "审查")) {
            return List.of(buildExecutionAction(
                    "发起测试设计/评审",
                    "基于当前工作项创建一个“测试设计/评审”执行任务。",
                    context.projectId(),
                    context.taskId(),
                    ExecutionWorkflowService.SCENARIO_TEST_DESIGN_OR_REVIEW,
                    request.question()
            ));
        }
        return List.of();
    }

    private HermesActionSummary buildExecutionAction(String title,
                                                     String description,
                                                     Long projectId,
                                                     Long taskId,
                                                     String scenarioCode,
                                                     String userQuestion) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("scenarioCode", scenarioCode);
        params.put("projectId", projectId);
        params.put("workItemId", taskId);
        params.put("triggerSource", "HERMES");

        Map<String, Object> inputPayload = new LinkedHashMap<>();
        inputPayload.put("userQuestion", userQuestion);
        params.put("inputPayload", inputPayload);

        return new HermesActionSummary(
                ACTION_CREATE_EXECUTION_TASK,
                title,
                description,
                true,
                params
        );
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
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
