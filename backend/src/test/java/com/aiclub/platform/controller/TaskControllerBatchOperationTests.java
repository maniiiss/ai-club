package com.aiclub.platform.controller;

import com.aiclub.platform.dto.BatchTaskOperationItem;
import com.aiclub.platform.dto.request.BatchTaskDeleteRequest;
import com.aiclub.platform.dto.request.BatchTaskUpdateRequest;
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
        when(platformStoreService.updateTaskBatchField(11L, request)).thenReturn(null);
        when(platformStoreService.updateTaskBatchField(12L, request)).thenThrow(new IllegalArgumentException("工作项不可更新"));

        List<BatchTaskOperationItem> results = controller.batchUpdate(request).data();

        assertThat(results).hasSize(2);
        assertThat(results.get(0).taskId()).isEqualTo(11L);
        assertThat(results.get(0).errorMessage()).isNull();
        assertThat(results.get(1).taskId()).isEqualTo(12L);
        assertThat(results.get(1).errorMessage()).isEqualTo("工作项不可更新");
        verify(platformStoreService).updateTaskBatchField(11L, request);
        verify(platformStoreService).updateTaskBatchField(12L, request);
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
