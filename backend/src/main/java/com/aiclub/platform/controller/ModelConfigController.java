package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AiModelConfigSummary;
import com.aiclub.platform.dto.ModelTestResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AiModelConfigRequest;
import com.aiclub.platform.service.ModelConfigService;
import jakarta.validation.Valid;
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
@RequestMapping("/api/model-configs")
public class ModelConfigController {

    private final ModelConfigService modelConfigService;

    public ModelConfigController(ModelConfigService modelConfigService) {
        this.modelConfigService = modelConfigService;
    }

    @GetMapping
    @RequirePermission("model:view")
    public ApiResponse<PageResponse<AiModelConfigSummary>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(modelConfigService.pageConfigs(page, size, keyword, provider, enabled));
    }

    @GetMapping("/options")
    public ApiResponse<List<AiModelConfigSummary>> options() {
        return ApiResponse.success(modelConfigService.listEnabledOptions());
    }

    @GetMapping("/{id}")
    @RequirePermission("model:view")
    public ApiResponse<AiModelConfigSummary> detail(@PathVariable Long id) {
        return ApiResponse.success(modelConfigService.getConfig(id));
    }

    @PostMapping
    @RequirePermission("model:manage")
    public ApiResponse<AiModelConfigSummary> create(@Valid @RequestBody AiModelConfigRequest request) {
        return ApiResponse.success(modelConfigService.createConfig(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("model:manage")
    public ApiResponse<AiModelConfigSummary> update(@PathVariable Long id, @Valid @RequestBody AiModelConfigRequest request) {
        return ApiResponse.success(modelConfigService.updateConfig(id, request));
    }

    @PostMapping("/{id}/test")
    @RequirePermission("model:manage")
    public ApiResponse<ModelTestResult> test(@PathVariable Long id) {
        return ApiResponse.success(modelConfigService.testConfig(id));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("model:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        modelConfigService.deleteConfig(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
