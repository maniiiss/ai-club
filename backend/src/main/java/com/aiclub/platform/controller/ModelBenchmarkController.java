package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ModelBenchmarkProgressView;
import com.aiclub.platform.dto.ModelBenchmarkRunDetail;
import com.aiclub.platform.dto.ModelBenchmarkRunSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.ModelBenchmarkCreateRequest;
import com.aiclub.platform.service.ModelBenchmarkService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 模型对比测试入口。
 * 创建、取消、删除需要 model:benchmark；查询沿用 model:view。
 */
@RestController
@RequestMapping("/api/model-benchmarks")
public class ModelBenchmarkController {

    private final ModelBenchmarkService modelBenchmarkService;

    public ModelBenchmarkController(ModelBenchmarkService modelBenchmarkService) {
        this.modelBenchmarkService = modelBenchmarkService;
    }

    @GetMapping
    @RequirePermission("model:view")
    public ApiResponse<PageResponse<ModelBenchmarkRunSummary>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status
    ) {
        return ApiResponse.success(modelBenchmarkService.page(page, size, keyword, status));
    }

    @GetMapping("/{id}")
    @RequirePermission("model:view")
    public ApiResponse<ModelBenchmarkRunDetail> detail(@PathVariable Long id) {
        return ApiResponse.success(modelBenchmarkService.getDetail(id));
    }

    @GetMapping("/{id}/progress")
    @RequirePermission("model:view")
    public ApiResponse<ModelBenchmarkProgressView> progress(@PathVariable Long id) {
        return ApiResponse.success(modelBenchmarkService.getProgress(id));
    }

    @PostMapping
    @RequirePermission("model:benchmark")
    public ApiResponse<ModelBenchmarkRunDetail> create(@Valid @RequestBody ModelBenchmarkCreateRequest request) {
        return ApiResponse.success(modelBenchmarkService.createAndStart(request));
    }

    @PostMapping("/{id}/cancel")
    @RequirePermission("model:benchmark")
    public ApiResponse<Void> cancel(@PathVariable Long id) {
        modelBenchmarkService.cancel(id);
        return new ApiResponse<>(true, "Canceled", null);
    }

    @PostMapping("/{id}/rerun")
    @RequirePermission("model:benchmark")
    public ApiResponse<ModelBenchmarkRunDetail> rerun(@PathVariable Long id) {
        return ApiResponse.success(modelBenchmarkService.rerun(id));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("model:benchmark")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        modelBenchmarkService.delete(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
