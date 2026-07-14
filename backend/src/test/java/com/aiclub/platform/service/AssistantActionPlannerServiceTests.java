package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantActionSummary;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantGroundingTarget;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 Assistant 写操作动作规划会复用已确认业务对象，避免重复追问用户。
 */
class AssistantActionPlannerServiceTests {

    @Test
    void shouldUseGroundedIterationWhenCreatingWorkItemDraft() {
        AssistantActionPlannerService service = new AssistantActionPlannerService();
        AssistantGroundingState groundingState = AssistantGroundingState.empty()
                .withBoundSlot("project", new AssistantGroundingTarget(
                        "project",
                        "PROJECT",
                        41L,
                        "示例项目",
                        "/projects/41/iterations",
                        41L,
                        "CONTEXT",
                        Map.of("projectId", 41L)
                ))
                .withBoundSlot("iteration", new AssistantGroundingTarget(
                        "iteration",
                        "ITERATION",
                        77L,
                        "示例项目二期迭代",
                        "/projects/41/iterations?iterationId=77",
                        41L,
                        "SELECTION",
                        Map.of("projectId", 41L)
                ));

        AssistantActionSummary action = service.createActionFromToolCall(
                PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
                Map.of("workItemType", "需求", "name", "营销激励数据权限调整", "content", "限制组织数据权限"),
                groundingState,
                "帮忙创建一个需求"
        );

        assertThat(action).isNotNull();
        assertThat(action.type()).isEqualTo("CREATE_WORK_ITEM_DRAFT");
        assertThat(action.params()).containsEntry("projectId", 41L);
        assertThat(action.params()).containsEntry("iterationId", 77L);
        assertThat(action.params()).containsEntry("workItemType", "需求");
    }
}
