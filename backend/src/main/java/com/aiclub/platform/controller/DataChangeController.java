package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeAuditItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeDsl;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangePreviewResult;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeRequestItem;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.DataWorkbenchRequests.DataChangeRejectRequest;
import com.aiclub.platform.dto.request.DataWorkbenchRequests.DataChangeSubmitRequest;
import com.aiclub.platform.dto.request.DataWorkbenchRequests.DataChangeTextRequest;
import com.aiclub.platform.service.DataChangeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * DataChange 数据变更控制器。
 */
@RestController
@RequestMapping("/api/data-workbench")
@OperationLog(moduleCode = "DATA_CHANGE", moduleName = "数据变更", bizType = "DATA_CHANGE_REQUEST")
public class DataChangeController {

    private final DataChangeService dataChangeService;

    public DataChangeController(DataChangeService dataChangeService) {
        this.dataChangeService = dataChangeService;
    }

    @PostMapping("/projects/{projectId}/data-change/parse")
    @RequirePermission("data-workbench:request")
    @OperationLog(actionCode = "DATA_CHANGE_PARSE", actionName = "解析数据变更")
    public ApiResponse<DataChangeDsl> parse(@PathVariable Long projectId,
                                            @Valid @RequestBody DataChangeTextRequest request) {
        return ApiResponse.success(dataChangeService.parse(projectId, request.text(), request.entityCode(), request.dsl()));
    }

    @PostMapping("/projects/{projectId}/data-change/preview")
    @RequirePermission("data-workbench:request")
    @OperationLog(actionCode = "DATA_CHANGE_PREVIEW", actionName = "预览数据变更")
    public ApiResponse<DataChangePreviewResult> preview(@PathVariable Long projectId,
                                                        @Valid @RequestBody DataChangeTextRequest request) {
        return ApiResponse.success(dataChangeService.preview(projectId, request.text(), request.entityCode(), request.dsl()));
    }

    @PostMapping("/projects/{projectId}/data-change/requests")
    @RequirePermission("data-workbench:request")
    @OperationLog(actionCode = "DATA_CHANGE_SUBMIT", actionName = "提交数据变更")
    public ApiResponse<DataChangeRequestItem> submit(@PathVariable Long projectId,
                                                     @Valid @RequestBody DataChangeSubmitRequest request) {
        return ApiResponse.success(dataChangeService.submit(projectId, request.text(), request.entityCode(), request.dsl()));
    }

    @GetMapping("/projects/{projectId}/data-change/requests")
    @RequirePermission("data-workbench:view")
    public ApiResponse<PageResponse<DataChangeRequestItem>> pageProjectRequests(@PathVariable Long projectId,
                                                                                @RequestParam(defaultValue = "1") int page,
                                                                                @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(dataChangeService.pageProjectRequests(projectId, page, size));
    }

    @GetMapping("/data-change/requests")
    @RequirePermission("data-workbench:approve")
    public ApiResponse<PageResponse<DataChangeRequestItem>> pageAllRequests(@RequestParam(defaultValue = "1") int page,
                                                                            @RequestParam(defaultValue = "10") int size,
                                                                            @RequestParam(required = false) Long projectId,
                                                                            @RequestParam(required = false) String approvalStatus,
                                                                            @RequestParam(required = false) String executionStatus) {
        return ApiResponse.success(dataChangeService.pageAllRequests(page, size, projectId, approvalStatus, executionStatus));
    }

    @PostMapping("/data-change/requests/{id}/approve")
    @RequirePermission("data-workbench:approve")
    @OperationLog(actionCode = "DATA_CHANGE_APPROVE", actionName = "审批数据变更", bizIdParam = "id")
    public ApiResponse<DataChangeRequestItem> approve(@PathVariable Long id) {
        return ApiResponse.success(dataChangeService.approve(id));
    }

    @PostMapping("/data-change/requests/{id}/reject")
    @RequirePermission("data-workbench:approve")
    @OperationLog(actionCode = "DATA_CHANGE_REJECT", actionName = "驳回数据变更", bizIdParam = "id")
    public ApiResponse<DataChangeRequestItem> reject(@PathVariable Long id,
                                                     @Valid @RequestBody DataChangeRejectRequest request) {
        return ApiResponse.success(dataChangeService.reject(id, request.reason()));
    }

    @PostMapping("/data-change/requests/{id}/execute")
    @RequirePermission("data-workbench:execute")
    @OperationLog(actionCode = "DATA_CHANGE_EXECUTE", actionName = "执行数据变更", bizIdParam = "id")
    public ApiResponse<DataChangeRequestItem> execute(@PathVariable Long id) {
        return ApiResponse.success(dataChangeService.execute(id));
    }

    @PostMapping("/data-change/requests/{id}/rollback")
    @RequirePermission("data-workbench:rollback")
    @OperationLog(actionCode = "DATA_CHANGE_ROLLBACK", actionName = "回滚数据变更", bizIdParam = "id")
    public ApiResponse<DataChangeRequestItem> rollback(@PathVariable Long id) {
        return ApiResponse.success(dataChangeService.rollback(id));
    }

    @GetMapping("/data-change/requests/{id}/audits")
    @RequirePermission("data-workbench:view")
    public ApiResponse<List<DataChangeAuditItem>> listAudits(@PathVariable Long id) {
        return ApiResponse.success(dataChangeService.listAudits(id));
    }
}
