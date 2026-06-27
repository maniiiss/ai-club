package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ApiTestCaseAiResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.apistudio.ApiStudioDebugExecutionResult;
import com.aiclub.platform.dto.apistudio.ApiStudioDebugRecordItem;
import com.aiclub.platform.dto.apistudio.ApiStudioDirectorySummary;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointDetail;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointSummary;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointVersionItem;
import com.aiclub.platform.dto.apistudio.ApiStudioEnvironmentDetail;
import com.aiclub.platform.dto.apistudio.ApiStudioProjectOverview;
import com.aiclub.platform.dto.apistudio.ApiStudioProjectTree;
import com.aiclub.platform.dto.request.ApiTestGenerationRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioDebugExecutionRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioDirectoryReorderRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioDirectoryRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEndpointReorderRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEndpointRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEnvironmentRequest;
import com.aiclub.platform.service.ApiTestCaseAiService;
import com.aiclub.platform.service.apistudio.ApiStudioDebugProxyService;
import com.aiclub.platform.service.apistudio.ApiStudioDirectoryService;
import com.aiclub.platform.service.apistudio.ApiStudioEndpointService;
import com.aiclub.platform.service.apistudio.ApiStudioEnvironmentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 原生 API 工作台 REST 控制器。
 *
 * 路由前缀：/api/api-studio/projects/{projectId}/...
 * 权限模型：
 *   - 读：api:view + ProjectDataPermissionService.requireProjectVisible
 *   - 写/调试：api:manage + ProjectDataPermissionService.requireProjectEditable
 *
 * 设计文档：docs/api-studio-native-technical-design-v1.md
 */
@RestController
@RequestMapping("/api/api-studio")
public class ApiStudioController {

    private final ApiStudioDirectoryService directoryService;
    private final ApiStudioEndpointService endpointService;
    private final ApiStudioEnvironmentService environmentService;
    private final ApiStudioDebugProxyService debugProxyService;
    private final ApiTestCaseAiService apiTestCaseAiService;

    public ApiStudioController(ApiStudioDirectoryService directoryService,
                               ApiStudioEndpointService endpointService,
                               ApiStudioEnvironmentService environmentService,
                               ApiStudioDebugProxyService debugProxyService,
                               ApiTestCaseAiService apiTestCaseAiService) {
        this.directoryService = directoryService;
        this.endpointService = endpointService;
        this.environmentService = environmentService;
        this.debugProxyService = debugProxyService;
        this.apiTestCaseAiService = apiTestCaseAiService;
    }

    // ========== 7.1 项目入口 ==========

    @GetMapping("/projects/{projectId}/overview")
    @RequirePermission("api:view")
    public ApiResponse<ApiStudioProjectOverview> overview(@PathVariable Long projectId) {
        return ApiResponse.success(directoryService.getOverview(projectId));
    }

    // ========== 7.2 目录 ==========

    @GetMapping("/projects/{projectId}/tree")
    @RequirePermission("api:view")
    public ApiResponse<ApiStudioProjectTree> tree(@PathVariable Long projectId) {
        return ApiResponse.success(directoryService.loadTree(projectId));
    }

    @PostMapping("/projects/{projectId}/directories")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioDirectorySummary> createDirectory(@PathVariable Long projectId,
                                                                   @Valid @RequestBody ApiStudioDirectoryRequest request) {
        return ApiResponse.success(directoryService.createDirectory(projectId, request));
    }

    @PutMapping("/projects/{projectId}/directories/{directoryId}")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioDirectorySummary> updateDirectory(@PathVariable Long projectId,
                                                                   @PathVariable Long directoryId,
                                                                   @Valid @RequestBody ApiStudioDirectoryRequest request) {
        return ApiResponse.success(directoryService.updateDirectory(projectId, directoryId, request));
    }

    @DeleteMapping("/projects/{projectId}/directories/{directoryId}")
    @RequirePermission("api:manage")
    public ApiResponse<Void> deleteDirectory(@PathVariable Long projectId, @PathVariable Long directoryId) {
        directoryService.deleteDirectory(projectId, directoryId);
        return ApiResponse.success(null);
    }

    @PutMapping("/projects/{projectId}/directories/reorder")
    @RequirePermission("api:manage")
    public ApiResponse<Void> reorderDirectories(@PathVariable Long projectId,
                                                @RequestBody ApiStudioDirectoryReorderRequest request) {
        directoryService.reorderDirectories(projectId, request);
        return ApiResponse.success(null);
    }

    // ========== 7.3 API 定义 ==========

    @GetMapping("/projects/{projectId}/endpoints")
    @RequirePermission("api:view")
    public ApiResponse<List<ApiStudioEndpointSummary>> listEndpoints(@PathVariable Long projectId,
                                                                     @RequestParam(required = false) Long directoryId,
                                                                     @RequestParam(required = false) String status,
                                                                     @RequestParam(required = false) String keyword,
                                                                     @RequestParam(required = false) String method) {
        return ApiResponse.success(endpointService.listEndpoints(projectId, directoryId, status, keyword, method));
    }

    @PostMapping("/projects/{projectId}/endpoints")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEndpointDetail> createEndpoint(@PathVariable Long projectId,
                                                               @Valid @RequestBody ApiStudioEndpointRequest request) {
        return ApiResponse.success(endpointService.create(projectId, request));
    }

    @GetMapping("/projects/{projectId}/endpoints/{endpointId}")
    @RequirePermission("api:view")
    public ApiResponse<ApiStudioEndpointDetail> getEndpoint(@PathVariable Long projectId, @PathVariable Long endpointId) {
        return ApiResponse.success(endpointService.getDetail(projectId, endpointId));
    }

    @PutMapping("/projects/{projectId}/endpoints/{endpointId}")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEndpointDetail> updateEndpoint(@PathVariable Long projectId,
                                                               @PathVariable Long endpointId,
                                                               @Valid @RequestBody ApiStudioEndpointRequest request) {
        return ApiResponse.success(endpointService.update(projectId, endpointId, request));
    }

    @DeleteMapping("/projects/{projectId}/endpoints/{endpointId}")
    @RequirePermission("api:manage")
    public ApiResponse<Void> deleteEndpoint(@PathVariable Long projectId, @PathVariable Long endpointId) {
        endpointService.delete(projectId, endpointId);
        return ApiResponse.success(null);
    }

    @PutMapping("/projects/{projectId}/endpoints/reorder")
    @RequirePermission("api:manage")
    public ApiResponse<Void> reorderEndpoints(@PathVariable Long projectId,
                                              @RequestBody ApiStudioEndpointReorderRequest request) {
        endpointService.reorder(projectId, request);
        return ApiResponse.success(null);
    }

    @PostMapping("/projects/{projectId}/endpoints/{endpointId}/publish")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEndpointDetail> publishEndpoint(@PathVariable Long projectId, @PathVariable Long endpointId) {
        return ApiResponse.success(endpointService.publish(projectId, endpointId));
    }

    @PostMapping("/projects/{projectId}/endpoints/{endpointId}/deprecate")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEndpointDetail> deprecateEndpoint(@PathVariable Long projectId, @PathVariable Long endpointId) {
        return ApiResponse.success(endpointService.deprecate(projectId, endpointId));
    }

    // ========== 7.4 环境 ==========

    @GetMapping("/projects/{projectId}/environments")
    @RequirePermission("api:view")
    public ApiResponse<List<ApiStudioEnvironmentDetail>> listEnvironments(@PathVariable Long projectId) {
        return ApiResponse.success(environmentService.list(projectId));
    }

    @PostMapping("/projects/{projectId}/environments")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEnvironmentDetail> createEnvironment(@PathVariable Long projectId,
                                                                     @Valid @RequestBody ApiStudioEnvironmentRequest request) {
        return ApiResponse.success(environmentService.create(projectId, request));
    }

    @PutMapping("/projects/{projectId}/environments/{environmentId}")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEnvironmentDetail> updateEnvironment(@PathVariable Long projectId,
                                                                     @PathVariable Long environmentId,
                                                                     @Valid @RequestBody ApiStudioEnvironmentRequest request) {
        return ApiResponse.success(environmentService.update(projectId, environmentId, request));
    }

    @DeleteMapping("/projects/{projectId}/environments/{environmentId}")
    @RequirePermission("api:manage")
    public ApiResponse<Void> deleteEnvironment(@PathVariable Long projectId, @PathVariable Long environmentId) {
        environmentService.delete(projectId, environmentId);
        return ApiResponse.success(null);
    }

    @PostMapping("/projects/{projectId}/environments/{environmentId}/set-default")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEnvironmentDetail> setDefaultEnvironment(@PathVariable Long projectId,
                                                                         @PathVariable Long environmentId) {
        return ApiResponse.success(environmentService.setDefault(projectId, environmentId));
    }

    // ========== 7.5 调试 ==========

    @PostMapping("/projects/{projectId}/endpoints/{endpointId}/debug-executions")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioDebugExecutionResult> debugExecute(@PathVariable Long projectId,
                                                                    @PathVariable Long endpointId,
                                                                    @RequestBody ApiStudioDebugExecutionRequest request) {
        return ApiResponse.success(debugProxyService.execute(projectId, endpointId, request));
    }

    @GetMapping("/projects/{projectId}/debug-records")
    @RequirePermission("api:view")
    public ApiResponse<PageResponse<ApiStudioDebugRecordItem>> listDebugRecords(@PathVariable Long projectId,
                                                                                @RequestParam(required = false) Long endpointId,
                                                                                @RequestParam(defaultValue = "1") int page,
                                                                                @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.success(PageResponse.from(debugProxyService.listRecords(projectId, endpointId, page, size)));
    }

    @GetMapping("/projects/{projectId}/debug-records/{recordId}")
    @RequirePermission("api:view")
    public ApiResponse<ApiStudioDebugRecordItem> getDebugRecord(@PathVariable Long projectId, @PathVariable Long recordId) {
        return ApiResponse.success(debugProxyService.getRecord(projectId, recordId));
    }

    @DeleteMapping("/projects/{projectId}/debug-records/{recordId}")
    @RequirePermission("api:view")
    public ApiResponse<Void> deleteDebugRecord(@PathVariable Long projectId, @PathVariable Long recordId) {
        debugProxyService.deleteRecord(projectId, recordId);
        return ApiResponse.success(null);
    }

    // ========== 7.6 版本 ==========

    @GetMapping("/projects/{projectId}/endpoints/{endpointId}/versions")
    @RequirePermission("api:view")
    public ApiResponse<List<ApiStudioEndpointVersionItem>> listVersions(@PathVariable Long projectId,
                                                                        @PathVariable Long endpointId) {
        return ApiResponse.success(endpointService.listVersions(projectId, endpointId));
    }

    @GetMapping("/projects/{projectId}/endpoints/{endpointId}/versions/{versionId}")
    @RequirePermission("api:view")
    public ApiResponse<ApiStudioEndpointVersionItem> getVersion(@PathVariable Long projectId,
                                                                @PathVariable Long endpointId,
                                                                @PathVariable Long versionId) {
        return ApiResponse.success(endpointService.getVersion(projectId, endpointId, versionId));
    }

    @PostMapping("/projects/{projectId}/endpoints/{endpointId}/versions/{versionId}/rollback")
    @RequirePermission("api:manage")
    public ApiResponse<ApiStudioEndpointDetail> rollbackVersion(@PathVariable Long projectId,
                                                                @PathVariable Long endpointId,
                                                                @PathVariable Long versionId) {
        return ApiResponse.success(endpointService.rollback(projectId, endpointId, versionId));
    }

    // ========== 7.7 预留接口（501） ==========

    @PostMapping("/projects/{projectId}/imports/openapi")
    @RequirePermission("api:manage")
    public ResponseEntity<ApiResponse<Void>> importOpenApi(@PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(ApiResponse.fail("OpenAPI 导入将在后续版本支持"));
    }

    @GetMapping("/projects/{projectId}/exports/openapi")
    @RequirePermission("api:view")
    public ResponseEntity<ApiResponse<Void>> exportOpenApi(@PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(ApiResponse.fail("OpenAPI 导出将在后续版本支持"));
    }

    @PostMapping("/projects/{projectId}/endpoints/{endpointId}/ai-test-cases")
    @RequirePermission("api:manage")
    @OperationLog(actionCode = "API_STUDIO_TEST_CASE_AI_GENERATE", actionName = "生成 API AI 测试用例")
    public ApiResponse<ApiTestCaseAiResult> aiTestCases(@PathVariable Long projectId,
                                                        @PathVariable Long endpointId,
                                                        @RequestBody(required = false) ApiTestGenerationRequest request) {
        return ApiResponse.success(apiTestCaseAiService.generate(projectId, endpointId, request));
    }

    @GetMapping("/projects/{projectId}/mock-rules")
    @RequirePermission("api:view")
    public ResponseEntity<ApiResponse<Void>> mockRules(@PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(ApiResponse.fail("Mock 规则将在后续版本支持"));
    }

    @GetMapping("/projects/{projectId}/runner-suites")
    @RequirePermission("api:view")
    public ResponseEntity<ApiResponse<Void>> runnerSuites(@PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(ApiResponse.fail("自动化 Runner 将在后续版本支持"));
    }
}
