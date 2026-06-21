package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ModelBenchmarkConfigDetail;
import com.aiclub.platform.dto.ModelBenchmarkConfigSummary;
import com.aiclub.platform.dto.ModelBenchmarkRunSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.ModelBenchmarkConfigCreateRequest;
import com.aiclub.platform.dto.request.ModelBenchmarkConfigUpdateRequest;
import com.aiclub.platform.dto.request.ModelBenchmarkRunTriggerRequest;
import com.aiclub.platform.service.ModelBenchmarkConfigService;
import com.aiclub.platform.service.ModelBenchmarkConfigService.ActiveRunConflictException;
import com.aiclub.platform.service.ModelBenchmarkRunService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 模型对比测试"配置维度"入口。
 *
 * <p>列表 = 配置（可重复编辑、可重复触发），子资源 /runs 为该配置的运行记录。
 * 写操作（增删改、触发）需要 model:benchmark；查询沿用 model:view。</p>
 */
@RestController
@RequestMapping("/api/model-benchmark-configs")
public class ModelBenchmarkConfigController {

    private final ModelBenchmarkConfigService configService;
    private final ModelBenchmarkRunService runService;

    public ModelBenchmarkConfigController(ModelBenchmarkConfigService configService,
                                          ModelBenchmarkRunService runService) {
        this.configService = configService;
        this.runService = runService;
    }

    @GetMapping
    @RequirePermission("model:view")
    public ApiResponse<PageResponse<ModelBenchmarkConfigSummary>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword
    ) {
        return ApiResponse.success(configService.page(page, size, keyword));
    }

    @GetMapping("/{id}")
    @RequirePermission("model:view")
    public ApiResponse<ModelBenchmarkConfigDetail> detail(@PathVariable Long id) {
        return ApiResponse.success(configService.getDetail(id));
    }

    @PostMapping
    @RequirePermission("model:benchmark")
    public ApiResponse<ModelBenchmarkConfigDetail> create(@Valid @RequestBody ModelBenchmarkConfigCreateRequest request) {
        return ApiResponse.success(configService.create(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("model:benchmark")
    public ApiResponse<ModelBenchmarkConfigDetail> update(@PathVariable Long id,
                                                          @Valid @RequestBody ModelBenchmarkConfigUpdateRequest request) {
        return ApiResponse.success(configService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("model:benchmark")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        configService.delete(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/{id}/runs")
    @RequirePermission("model:view")
    public ApiResponse<PageResponse<ModelBenchmarkRunSummary>> listRuns(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(runService.pageByConfig(id, page, size));
    }

    /**
     * 触发一次运行，请求体可选；存在 active run 时返回 409。
     * 返回该配置的最新详情（含新生成的 latestRun + activeRunId），便于前端立刻打开抽屉。
     */
    @PostMapping("/{id}/runs")
    @RequirePermission("model:benchmark")
    public ApiResponse<ModelBenchmarkConfigDetail> triggerRun(@PathVariable Long id,
                                                              @RequestBody(required = false) @Valid ModelBenchmarkRunTriggerRequest request) {
        String suffix = request == null ? null : request.nameSuffix();
        configService.triggerRun(id, suffix);
        return ApiResponse.success(configService.getDetail(id));
    }

    /**
     * 把"存在 active run 的写操作"统一映射为 409，并保留中文 message 供前端 toast。
     * code 字段帮助前端做精确分支判断。
     */
    @ExceptionHandler(ActiveRunConflictException.class)
    public ResponseEntity<ApiResponse<Void>> handleActiveRunConflict(ActiveRunConflictException ex) {
        ApiResponse<Void> body = new ApiResponse<>(false, ex.getMessage(), null);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }
}
