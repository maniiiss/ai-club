package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AgentSummary;
import com.aiclub.platform.dto.AgentTestResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AgentRequest;
import com.aiclub.platform.dto.request.AgentTestRequest;
import com.aiclub.platform.service.AgentExecutionService;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.RuntimeRegistryService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

@RestController
@RequestMapping("/api/agents")
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private final PlatformStoreService platformStoreService;
    private final AgentExecutionService agentExecutionService;
    private final RuntimeRegistryService runtimeRegistryService;

    public AgentController(PlatformStoreService platformStoreService,
                           AgentExecutionService agentExecutionService,
                           RuntimeRegistryService runtimeRegistryService) {
        this.platformStoreService = platformStoreService;
        this.agentExecutionService = agentExecutionService;
        this.runtimeRegistryService = runtimeRegistryService;
    }

    @GetMapping
    @RequirePermission("agent:view")
    public ApiResponse<PageResponse<AgentSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String accessType,
            @RequestParam(required = false) Long projectId
    ) {
        return ApiResponse.success(platformStoreService.pageAgents(page, size, keyword, status, type, accessType, projectId));
    }

    @GetMapping("/options")
    public ApiResponse<List<AgentSummary>> options(@RequestParam(required = false) Long projectId) {
        if (projectId == null) {
            return ApiResponse.success(platformStoreService.listEnabledAgents());
        }
        return ApiResponse.success(platformStoreService.listEnabledAgentsByProject(projectId));
    }

    @GetMapping("/{id}")
    @RequirePermission("agent:view")
    public ApiResponse<AgentSummary> detail(@PathVariable Long id) {
        return ApiResponse.success(platformStoreService.getAgent(id));
    }

    @PostMapping
    @RequirePermission("agent:manage")
    public ApiResponse<AgentSummary> create(@Valid @RequestBody AgentRequest request) {
        validateRuntimeRegistry(request);
        return ApiResponse.success(platformStoreService.createAgent(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("agent:manage")
    public ApiResponse<AgentSummary> update(@PathVariable Long id, @Valid @RequestBody AgentRequest request) {
        validateRuntimeRegistry(request);
        return ApiResponse.success(platformStoreService.updateAgent(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("agent:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        platformStoreService.deleteAgent(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/{id}/test")
    @RequirePermission("agent:manage")
    public ApiResponse<AgentTestResult> test(@PathVariable Long id,
                                             @Valid @RequestBody AgentTestRequest request) {
        int inputLength = request.input() == null ? 0 : request.input().length();
        log.info("Agent test request received: agentId={}, inputLength={}", id, inputLength);
        AgentTestResult result = agentExecutionService.testAgent(id, request.input());
        log.info("Agent test request completed: agentId={}, success={}, message={}", id, result.success(), result.message());
        return ApiResponse.success(result);
    }

    /** Agent 保存时只校验 Registry 引用存在；健康状态留给发布/执行前置校验，便于管理员先配置后探测。 */
    private void validateRuntimeRegistry(AgentRequest request) {
        if (!AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(request.accessType())) return;
        String code = request.runtimeRegistryCode() == null || request.runtimeRegistryCode().isBlank()
                ? request.runtimeType() : request.runtimeRegistryCode();
        runtimeRegistryService.require(code);
    }
}
