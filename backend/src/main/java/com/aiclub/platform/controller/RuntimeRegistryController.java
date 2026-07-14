package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.RuntimeRegistrySummary;
import com.aiclub.platform.dto.request.RuntimeRegistryRequest;
import com.aiclub.platform.service.RuntimeRegistryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Runtime 注册中心管理接口，供平台管理员维护可用 Runtime。 */
@RestController
@RequestMapping("/api/runtime-registry")
public class RuntimeRegistryController {

    private final RuntimeRegistryService service;
    private final com.aiclub.platform.service.RuntimeHealthCheckService healthCheckService;

    public RuntimeRegistryController(RuntimeRegistryService service,
                                     com.aiclub.platform.service.RuntimeHealthCheckService healthCheckService) {
        this.service = service;
        this.healthCheckService = healthCheckService;
    }

    @GetMapping
    @RequirePermission("runtime:manage")
    public ApiResponse<List<RuntimeRegistrySummary>> list() {
        return ApiResponse.success(service.list());
    }

    /** Agent 管理页只读取可选 Runtime，不授予普通管理员修改 Registry 的权限。 */
    @GetMapping("/options")
    @RequirePermission("agent:view")
    public ApiResponse<List<RuntimeRegistrySummary>> options() {
        return ApiResponse.success(service.list());
    }

    @PostMapping
    @RequirePermission("runtime:manage")
    public ApiResponse<RuntimeRegistrySummary> create(@Valid @RequestBody RuntimeRegistryRequest request) {
        return ApiResponse.success(service.save(request));
    }

    @PutMapping("/{runtimeCode}")
    @RequirePermission("runtime:manage")
    public ApiResponse<RuntimeRegistrySummary> update(@PathVariable String runtimeCode,
                                                       @Valid @RequestBody RuntimeRegistryRequest request) {
        if (!runtimeCode.equalsIgnoreCase(request.runtimeCode())) {
            throw new IllegalArgumentException("Runtime code cannot be changed");
        }
        return ApiResponse.success(service.save(request));
    }

    @PostMapping("/{runtimeCode}/enable")
    @RequirePermission("runtime:manage")
    public ApiResponse<RuntimeRegistrySummary> enable(@PathVariable String runtimeCode) {
        return ApiResponse.success(service.setEnabled(runtimeCode, true));
    }

    @PostMapping("/{runtimeCode}/disable")
    @RequirePermission("runtime:manage")
    public ApiResponse<RuntimeRegistrySummary> disable(@PathVariable String runtimeCode) {
        return ApiResponse.success(service.setEnabled(runtimeCode, false));
    }

    @PostMapping("/{runtimeCode}/health-check")
    @RequirePermission("runtime:manage")
    public ApiResponse<RuntimeRegistrySummary> healthCheck(@PathVariable String runtimeCode) {
        return ApiResponse.success(healthCheckService.check(runtimeCode));
    }

    @DeleteMapping("/{runtimeCode}")
    @RequirePermission("runtime:manage")
    public ApiResponse<RuntimeRegistrySummary> delete(@PathVariable String runtimeCode) {
        // 注册项不能物理删除，否则历史任务快照无法回显；DELETE 采用幂等禁用语义。
        return ApiResponse.success(service.setEnabled(runtimeCode, false));
    }
}
