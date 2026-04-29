package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.TestPlanSummary;
import com.aiclub.platform.dto.request.TestPlanRequest;
import com.aiclub.platform.service.TestPlanAutomationService;
import com.aiclub.platform.service.TestManagementService;
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
@RequestMapping("/api/test-plans")
public class TestPlanController {

    private final TestManagementService testManagementService;
    private final TestPlanAutomationService testPlanAutomationService;

    public TestPlanController(TestManagementService testManagementService,
                              TestPlanAutomationService testPlanAutomationService) {
        this.testManagementService = testManagementService;
        this.testPlanAutomationService = testPlanAutomationService;
    }

    @GetMapping
    @RequirePermission("test:view")
    public ApiResponse<PageResponse<TestPlanSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long iterationId,
            @RequestParam(required = false) String status
    ) {
        return ApiResponse.success(testManagementService.pageTestPlans(page, size, keyword, projectId, iterationId, status));
    }

    @GetMapping("/{id}")
    @RequirePermission("test:view")
    public ApiResponse<TestPlanSummary> detail(@PathVariable Long id) {
        return ApiResponse.success(testManagementService.getTestPlan(id));
    }

    @GetMapping("/projects/{projectId}/iterations")
    @RequirePermission("test:view")
    public ApiResponse<List<IterationSummary>> listIterations(@PathVariable Long projectId) {
        return ApiResponse.success(testManagementService.listProjectIterationOptions(projectId));
    }

    @PostMapping
    @RequirePermission("test:manage")
    public ApiResponse<TestPlanSummary> create(@Valid @RequestBody TestPlanRequest request) {
        return ApiResponse.success(testManagementService.createTestPlan(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("test:manage")
    public ApiResponse<TestPlanSummary> update(@PathVariable Long id, @Valid @RequestBody TestPlanRequest request) {
        return ApiResponse.success(testManagementService.updateTestPlan(id, request));
    }

    @PostMapping("/{id}/automation/generate-and-run")
    @RequirePermission("test:manage")
    public ApiResponse<ExecutionTaskSummary> generateAndRunAutomation(@PathVariable Long id) {
        return ApiResponse.success(testPlanAutomationService.generateAndRun(id));
    }

    @PostMapping("/{id}/automation/run")
    @RequirePermission("test:manage")
    public ApiResponse<ExecutionTaskSummary> runAutomation(@PathVariable Long id) {
        return ApiResponse.success(testPlanAutomationService.runExistingAutomation(id));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("test:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        testManagementService.deleteTestPlan(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
