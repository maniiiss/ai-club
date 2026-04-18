package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionRunDetail;
import com.aiclub.platform.service.ExecutionTaskService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * 执行运行详情控制器。
 */
@RestController
@RequestMapping("/api/execution-runs")
public class ExecutionRunController {

    private final ExecutionTaskService executionTaskService;

    public ExecutionRunController(ExecutionTaskService executionTaskService) {
        this.executionTaskService = executionTaskService;
    }

    @GetMapping("/{id}")
    @RequirePermission("task:view")
    public ApiResponse<ExecutionRunDetail> detail(@PathVariable Long id) {
        return ApiResponse.success(executionTaskService.getExecutionRun(id));
    }

    @GetMapping(value = "/{id}/events/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission("task:view")
    public ResponseEntity<StreamingResponseBody> stream(@PathVariable Long id,
                                                        @RequestParam(required = false) Long afterId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(executionTaskService.streamExecutionRunEvents(id, afterId));
    }
}
