package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.RuntimeCapabilities;
import com.aiclub.platform.service.RuntimeCapabilityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前端运行时能力接口。
 * 不额外要求功能权限，但仍需要登录态，以便已登录用户在不重新登录的情况下感知模块即时停用状态。
 */
@RestController
@RequestMapping("/api/runtime-capabilities")
public class RuntimeCapabilityController {

    private final RuntimeCapabilityService runtimeCapabilityService;

    public RuntimeCapabilityController(RuntimeCapabilityService runtimeCapabilityService) {
        this.runtimeCapabilityService = runtimeCapabilityService;
    }

    @GetMapping
    public ApiResponse<RuntimeCapabilities> getCapabilities() {
        return ApiResponse.success(runtimeCapabilityService.getCapabilities());
    }
}
