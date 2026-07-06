package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 Hermes 写操作动作规划会复用已确认业务对象，避免重复追问用户。
 */
class HermesActionPlannerServiceTests {

    @Test
    void shouldUseGroundedIterationWhenCreatingWorkItemDraft() {
        HermesActionPlannerService service = new HermesActionPlannerService();
        HermesGroundingState groundingState = HermesGroundingState.empty()
                .withBoundSlot("project", new HermesGroundingTarget(
                        "project",
                        "PROJECT",
                        41L,
                        "CRM 项目",
                        "/projects/41/iterations",
                        41L,
                        "CONTEXT",
                        Map.of("projectId", 41L)
                ))
                .withBoundSlot("iteration", new HermesGroundingTarget(
                        "iteration",
                        "ITERATION",
                        77L,
                        "CRM 二期迭代",
                        "/projects/41/iterations?iterationId=77",
                        41L,
                        "SELECTION",
                        Map.of("projectId", 41L)
                ));

        HermesActionSummary action = service.createActionFromToolCall(
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
