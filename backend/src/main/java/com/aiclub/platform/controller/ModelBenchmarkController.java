package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ModelBenchmarkProgressView;
import com.aiclub.platform.dto.ModelBenchmarkRunDetail;
import com.aiclub.platform.service.ModelBenchmarkRunService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 模型对比测试"运行记录维度"入口。
 *
 * <p>新模型下，全局运行列表与"创建并立即启动"端点都已删除：
 * 列表改为配置维度（{@link ModelBenchmarkConfigController}），
 * 触发运行通过 {@code POST /api/model-benchmark-configs/{id}/runs}。本控制器只保留
 * 单条 run 的读 / 取消 / 删除以及轮询进度。</p>
 */
@RestController
@RequestMapping("/api/model-benchmarks")
public class ModelBenchmarkController {

    private final ModelBenchmarkRunService runService;

    public ModelBenchmarkController(ModelBenchmarkRunService runService) {
        this.runService = runService;
    }

    @GetMapping("/{id}")
    @RequirePermission("model:view")
    public ApiResponse<ModelBenchmarkRunDetail> detail(@PathVariable Long id) {
        return ApiResponse.success(runService.getDetail(id));
    }

    @GetMapping("/{id}/progress")
    @RequirePermission("model:view")
    public ApiResponse<ModelBenchmarkProgressView> progress(@PathVariable Long id) {
        return ApiResponse.success(runService.getProgress(id));
    }

    @PostMapping("/{id}/cancel")
    @RequirePermission("model:benchmark")
    public ApiResponse<Void> cancel(@PathVariable Long id) {
        runService.cancel(id);
        return new ApiResponse<>(true, "Canceled", null);
    }

    @DeleteMapping("/{id}")
    @RequirePermission("model:benchmark")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        runService.delete(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
