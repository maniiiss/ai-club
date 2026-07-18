package com.aiclub.platform.controller;

import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.request.BatchRequirementAiRequest;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.CreditConsumptionService;
import com.aiclub.platform.service.RequirementAiExecutionQueryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PublicRequirementAiControllerBatchTests {

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldCreateAllSelectedRequirementAiTasksThroughOneBatchRequest() {
        RequirementAiExecutionQueryService executionQueryService = mock(RequirementAiExecutionQueryService.class);
        CreditConsumptionService creditConsumptionService = mock(CreditConsumptionService.class);
        PublicRequirementAiController controller = new PublicRequirementAiController(executionQueryService, creditConsumptionService);
        AuthContextHolder.set(new AuthContext(7L, "batch-user", "批量用户", Set.of(), Set.of("task:view")));
        ExecutionTaskSummary summary = summary(91L);
        when(creditConsumptionService.consumeForFeature(
                eq(7L),
                eq("REQUIREMENT_AI"),
                anyString(),
                eq("需求AI助手：标准化需求"),
                anySupplier()
        )).thenReturn(summary);

        var results = controller.generateBatchRequirementAi(new BatchRequirementAiRequest(
                List.of(31L, 32L), "STANDARDIZE")).data();

        assertThat(results).hasSize(2);
        assertThat(results).allSatisfy(result -> {
            assertThat(result.executionTask()).isEqualTo(summary);
            assertThat(result.errorMessage()).isNull();
        });
        verify(creditConsumptionService, times(2)).consumeForFeature(
                eq(7L), eq("REQUIREMENT_AI"), anyString(), eq("需求AI助手：标准化需求"), anySupplier());
    }

    @SuppressWarnings("unchecked")
    private static <T> Supplier<T> anySupplier() {
        return (Supplier<T>) any(Supplier.class);
    }

    private ExecutionTaskSummary summary(Long id) {
        return new ExecutionTaskSummary(id, "需求 AI 分析", "REQUIREMENT_AI_ANALYSIS", "需求 AI 分析",
                "PUBLIC_REQUIREMENT_AI", 31L, 4L, "示例项目", 31L, "#REQ01", "示例需求",
                "PENDING", null, null, 0, null, null, "等待调度", false, false,
                7L, "批量用户", "", "");
    }
}
