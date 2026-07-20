package com.aiclub.platform.controller;

import com.aiclub.platform.dto.BatchTaskOperationItem;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.BatchTaskDeleteRequest;
import com.aiclub.platform.dto.request.BatchTaskUpdateRequest;
import com.aiclub.platform.dto.request.TaskInlineUpdateRequest;
import com.aiclub.platform.service.ExecutionTaskService;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.RequirementAiExecutionQueryService;
import com.aiclub.platform.service.TaskAgentRunService;
import com.aiclub.platform.service.TaskPrdService;
import com.aiclub.platform.service.WorkItemLinkService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskControllerBatchOperationTests {

    @Test
    void shouldReturnPartialBatchUpdateResultsFromOneControllerCall() {
        PlatformStoreService platformStoreService = mock(PlatformStoreService.class);
        TaskController controller = controller(platformStoreService);
        BatchTaskUpdateRequest request = new BatchTaskUpdateRequest(
                List.of(11L, 12L), BatchTaskUpdateRequest.Field.PRIORITY, "高", null, null);
        TaskSummary updatedTask = mock(TaskSummary.class);
        when(updatedTask.projectId()).thenReturn(9L);
        when(platformStoreService.updateTaskBatchFieldWithoutGraph(11L, request)).thenReturn(updatedTask);
        when(platformStoreService.updateTaskBatchFieldWithoutGraph(12L, request)).thenThrow(new IllegalArgumentException("工作项不可更新"));

        List<BatchTaskOperationItem> results = controller.batchUpdate(request).data();

        assertThat(results).hasSize(2);
        assertThat(results.get(0).taskId()).isEqualTo(11L);
        assertThat(results.get(0).errorMessage()).isNull();
        assertThat(results.get(1).taskId()).isEqualTo(12L);
        assertThat(results.get(1).errorMessage()).isEqualTo("工作项不可更新");
        verify(platformStoreService).updateTaskBatchFieldWithoutGraph(11L, request);
        verify(platformStoreService).updateTaskBatchFieldWithoutGraph(12L, request);
        verify(platformStoreService).rebuildProjectGraphs(java.util.Set.of(9L));
    }

    /** 同一项目的多个工作项成功更新后，知识图谱只重建一次。 */
    @Test
    void shouldRebuildKnowledgeGraphOnceForSameProjectBatch() {
        PlatformStoreService platformStoreService = mock(PlatformStoreService.class);
        TaskController controller = controller(platformStoreService);
        BatchTaskUpdateRequest request = new BatchTaskUpdateRequest(
                List.of(11L, 12L), BatchTaskUpdateRequest.Field.STATUS, "进行中", null, null);
        TaskSummary firstTask = mock(TaskSummary.class);
        TaskSummary secondTask = mock(TaskSummary.class);
        when(firstTask.projectId()).thenReturn(9L);
        when(secondTask.projectId()).thenReturn(9L);
        when(platformStoreService.updateTaskBatchFieldWithoutGraph(11L, request)).thenReturn(firstTask);
        when(platformStoreService.updateTaskBatchFieldWithoutGraph(12L, request)).thenReturn(secondTask);

        controller.batchUpdate(request);

        verify(platformStoreService).rebuildProjectGraphs(java.util.Set.of(9L));
    }

    @Test
    void shouldReturnPartialBatchDeleteResultsFromOneControllerCall() {
        PlatformStoreService platformStoreService = mock(PlatformStoreService.class);
        TaskController controller = controller(platformStoreService);
        BatchTaskDeleteRequest request = new BatchTaskDeleteRequest(List.of(21L, 22L));
        doThrow(new IllegalArgumentException("当前角色配置不允许删除该工作项"))
                .when(platformStoreService).deleteTask(22L);

        List<BatchTaskOperationItem> results = controller.batchDelete(request).data();

        assertThat(results).hasSize(2);
        assertThat(results.get(0).errorMessage()).isNull();
        assertThat(results.get(1).errorMessage()).isEqualTo("当前角色配置不允许删除该工作项");
        verify(platformStoreService).deleteTask(21L);
        verify(platformStoreService).deleteTask(22L);
    }

    /** 列表快捷编辑走独立轻量接口，不复用完整工作项更新入口。 */
    @Test
    void shouldDelegateInlineUpdateToLightweightServiceMethod() {
        PlatformStoreService platformStoreService = mock(PlatformStoreService.class);
        TaskController controller = controller(platformStoreService);
        TaskInlineUpdateRequest request = new TaskInlineUpdateRequest(
                TaskInlineUpdateRequest.Field.PLAN_DATES, null, null, "2026-07-20", "2026-07-22");

        controller.inlineUpdate(11L, request);

        verify(platformStoreService).updateTaskInline(11L, request);
    }

    private TaskController controller(PlatformStoreService platformStoreService) {
        return new TaskController(
                platformStoreService,
                mock(TaskAgentRunService.class),
                mock(RequirementAiExecutionQueryService.class),
                mock(TaskPrdService.class),
                mock(WorkItemLinkService.class),
                mock(ExecutionTaskService.class)
        );
    }
}
