package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionOrchestrationProfileSummary;
import com.aiclub.platform.dto.ExecutionOrchestrationScenarioSummary;
import com.aiclub.platform.dto.ExecutionOrchestrationVersionSummary;
import com.aiclub.platform.dto.request.UpdateExecutionOrchestrationVersionRequest;
import com.aiclub.platform.service.ExecutionOrchestrationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 执行编排管理接口；读取就绪状态向普通登录用户开放，写操作在领域服务内按范围鉴权。 */
@RestController
@RequestMapping("/api/execution-orchestrations")
public class ExecutionOrchestrationController {
    private final ExecutionOrchestrationService service;
    public ExecutionOrchestrationController(ExecutionOrchestrationService service){this.service=service;}

    @GetMapping("/scenarios")
    public ApiResponse<List<ExecutionOrchestrationScenarioSummary>> scenarios(@RequestParam(required=false) Long projectId){
        return ApiResponse.success(service.listScenarios(projectId));
    }

    @GetMapping("/profiles")
    public ApiResponse<List<ExecutionOrchestrationProfileSummary>> profiles(@RequestParam String scopeType,
                                                                            @RequestParam(required=false) Long projectId){
        return ApiResponse.success(service.listProfiles(scopeType,projectId));
    }

    /** sourceVersionId 为空时按当前有效版本创建草稿。 */
    @PostMapping("/profiles/{id}/drafts")
    public ApiResponse<ExecutionOrchestrationVersionSummary> createDraft(@PathVariable Long id,
            @RequestParam(required=false) Long sourceVersionId){
        return ApiResponse.success(service.createDraft(id,sourceVersionId));
    }

    @PutMapping("/versions/{id}")
    public ApiResponse<ExecutionOrchestrationVersionSummary> update(@PathVariable Long id,
            @Valid @RequestBody UpdateExecutionOrchestrationVersionRequest request){
        return ApiResponse.success(service.updateDraft(id,request));
    }

    @PostMapping("/versions/{id}/publish")
    public ApiResponse<ExecutionOrchestrationVersionSummary> publish(@PathVariable Long id){
        return ApiResponse.success(service.publish(id));
    }

    @DeleteMapping("/versions/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id){service.deleteDraft(id);return ApiResponse.success(null);}

    @PostMapping("/profiles/{id}/abandon")
    public ApiResponse<ExecutionOrchestrationProfileSummary> abandon(@PathVariable Long id){
        return ApiResponse.success(service.abandonProjectOverride(id));
    }
}
