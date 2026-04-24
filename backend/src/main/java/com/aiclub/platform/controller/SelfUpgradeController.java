package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.SelfUpgradeCenterConfigSummary;
import com.aiclub.platform.dto.SelfUpgradePatrolPlanSummary;
import com.aiclub.platform.dto.SelfUpgradePatrolRunSummary;
import com.aiclub.platform.dto.SelfUpgradeSuggestionDetail;
import com.aiclub.platform.dto.SelfUpgradeSuggestionSummary;
import com.aiclub.platform.dto.SelfUpgradeWorkItemSummary;
import com.aiclub.platform.dto.request.SelfUpgradeCenterConfigRequest;
import com.aiclub.platform.dto.request.SelfUpgradePatrolPlanRequest;
import com.aiclub.platform.dto.request.SelfUpgradeWorkItemCompleteRequest;
import com.aiclub.platform.dto.request.SelfUpgradeWorkItemUpdateRequest;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.SelfUpgradeConfigService;
import com.aiclub.platform.service.SelfUpgradeExecutionBridgeService;
import com.aiclub.platform.service.SelfUpgradePatrolPlanService;
import com.aiclub.platform.service.SelfUpgradePatrolRunService;
import com.aiclub.platform.service.SelfUpgradeSuggestionService;
import com.aiclub.platform.service.SelfUpgradeWorkItemService;
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

@RestController
@RequestMapping("/api/self-upgrade")
public class SelfUpgradeController {

    private final SelfUpgradeConfigService configService;
    private final SelfUpgradePatrolPlanService patrolPlanService;
    private final SelfUpgradePatrolRunService patrolRunService;
    private final SelfUpgradeSuggestionService suggestionService;
    private final SelfUpgradeWorkItemService workItemService;
    private final SelfUpgradeExecutionBridgeService executionBridgeService;
    private final UserRepository userRepository;

    public SelfUpgradeController(SelfUpgradeConfigService configService,
                                 SelfUpgradePatrolPlanService patrolPlanService,
                                 SelfUpgradePatrolRunService patrolRunService,
                                 SelfUpgradeSuggestionService suggestionService,
                                 SelfUpgradeWorkItemService workItemService,
                                 SelfUpgradeExecutionBridgeService executionBridgeService,
                                 UserRepository userRepository) {
        this.configService = configService;
        this.patrolPlanService = patrolPlanService;
        this.patrolRunService = patrolRunService;
        this.suggestionService = suggestionService;
        this.workItemService = workItemService;
        this.executionBridgeService = executionBridgeService;
        this.userRepository = userRepository;
    }

    @GetMapping("/config")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<SelfUpgradeCenterConfigSummary> getConfig() {
        return ApiResponse.success(configService.getConfig());
    }

    @PutMapping("/config")
    @RequirePermission("self-upgrade:config:manage")
    public ApiResponse<SelfUpgradeCenterConfigSummary> updateConfig(@Valid @RequestBody SelfUpgradeCenterConfigRequest request) {
        return ApiResponse.success(configService.updateConfig(request));
    }

    @GetMapping("/plans")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<PageResponse<SelfUpgradePatrolPlanSummary>> pagePlans(@RequestParam(defaultValue = "1") int page,
                                                                             @RequestParam(defaultValue = "20") int size,
                                                                             @RequestParam(required = false) String keyword,
                                                                             @RequestParam(required = false) Boolean enabled) {
        return ApiResponse.success(patrolPlanService.pagePlans(page, size, keyword, enabled));
    }

    @GetMapping("/plans/{id}")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<SelfUpgradePatrolPlanSummary> getPlan(@PathVariable Long id) {
        return ApiResponse.success(patrolPlanService.getPlan(id));
    }

    @PostMapping("/plans")
    @RequirePermission("self-upgrade:plan:manage")
    public ApiResponse<SelfUpgradePatrolPlanSummary> createPlan(@Valid @RequestBody SelfUpgradePatrolPlanRequest request) {
        return ApiResponse.success(patrolPlanService.createPlan(request));
    }

    @PutMapping("/plans/{id}")
    @RequirePermission("self-upgrade:plan:manage")
    public ApiResponse<SelfUpgradePatrolPlanSummary> updatePlan(@PathVariable Long id,
                                                                @Valid @RequestBody SelfUpgradePatrolPlanRequest request) {
        return ApiResponse.success(patrolPlanService.updatePlan(id, request));
    }

    @DeleteMapping("/plans/{id}")
    @RequirePermission("self-upgrade:plan:manage")
    public ApiResponse<Void> deletePlan(@PathVariable Long id) {
        patrolPlanService.deletePlan(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/plans/{id}/enable")
    @RequirePermission("self-upgrade:plan:manage")
    public ApiResponse<SelfUpgradePatrolPlanSummary> enablePlan(@PathVariable Long id) {
        return ApiResponse.success(patrolPlanService.setPlanEnabled(id, true));
    }

    @PostMapping("/plans/{id}/disable")
    @RequirePermission("self-upgrade:plan:manage")
    public ApiResponse<SelfUpgradePatrolPlanSummary> disablePlan(@PathVariable Long id) {
        return ApiResponse.success(patrolPlanService.setPlanEnabled(id, false));
    }

    @PostMapping("/plans/{id}/run")
    @RequirePermission("self-upgrade:execution:start")
    public ApiResponse<SelfUpgradePatrolRunSummary> runPlanNow(@PathVariable Long id) {
        return ApiResponse.success(patrolRunService.toRunSummary(
                executionBridgeService.startPatrolRun(id, requireCurrentUser(), "MANUAL")
        ));
    }

    @GetMapping("/runs")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<PageResponse<SelfUpgradePatrolRunSummary>> pageRuns(@RequestParam(defaultValue = "1") int page,
                                                                           @RequestParam(defaultValue = "20") int size,
                                                                           @RequestParam(required = false) Long planId,
                                                                           @RequestParam(required = false) String status) {
        return ApiResponse.success(patrolRunService.pageRuns(page, size, planId, status));
    }

    @GetMapping("/runs/{id}")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<SelfUpgradePatrolRunSummary> getRun(@PathVariable Long id) {
        return ApiResponse.success(patrolRunService.getRun(id));
    }

    @GetMapping("/suggestions")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<PageResponse<SelfUpgradeSuggestionSummary>> pageSuggestions(@RequestParam(defaultValue = "1") int page,
                                                                                   @RequestParam(defaultValue = "20") int size,
                                                                                   @RequestParam(required = false) String keyword,
                                                                                   @RequestParam(required = false) String status,
                                                                                   @RequestParam(required = false) String category,
                                                                                   @RequestParam(required = false) String severity) {
        return ApiResponse.success(suggestionService.pageSuggestions(page, size, keyword, status, category, severity));
    }

    @GetMapping("/suggestions/{id}")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<SelfUpgradeSuggestionDetail> getSuggestion(@PathVariable Long id) {
        return ApiResponse.success(suggestionService.getSuggestion(id));
    }

    @PostMapping("/suggestions/{id}/accept")
    @RequirePermission("self-upgrade:suggestion:manage")
    public ApiResponse<SelfUpgradeSuggestionDetail> acceptSuggestion(@PathVariable Long id) {
        return ApiResponse.success(suggestionService.acceptSuggestion(id));
    }

    @PostMapping("/suggestions/{id}/reject")
    @RequirePermission("self-upgrade:suggestion:manage")
    public ApiResponse<SelfUpgradeSuggestionDetail> rejectSuggestion(@PathVariable Long id) {
        return ApiResponse.success(suggestionService.rejectSuggestion(id));
    }

    @GetMapping("/work-items/{id}")
    @RequirePermission("self-upgrade:view")
    public ApiResponse<SelfUpgradeWorkItemSummary> getWorkItem(@PathVariable Long id) {
        return ApiResponse.success(workItemService.getWorkItem(id));
    }

    @PutMapping("/work-items/{id}")
    @RequirePermission("self-upgrade:work-item:manage")
    public ApiResponse<SelfUpgradeWorkItemSummary> updateWorkItem(@PathVariable Long id,
                                                                  @Valid @RequestBody SelfUpgradeWorkItemUpdateRequest request) {
        return ApiResponse.success(workItemService.updateWorkItem(id, request));
    }

    @PostMapping("/work-items/{id}/execute")
    @RequirePermission("self-upgrade:execution:start")
    public ApiResponse<SelfUpgradeWorkItemSummary> startWorkItemExecution(@PathVariable Long id) {
        return ApiResponse.success(workItemService.startExecution(id));
    }

    @PostMapping("/work-items/{id}/complete")
    @RequirePermission("self-upgrade:work-item:manage")
    public ApiResponse<SelfUpgradeWorkItemSummary> completeWorkItem(@PathVariable Long id,
                                                                    @Valid @RequestBody SelfUpgradeWorkItemCompleteRequest request) {
        return ApiResponse.success(workItemService.completeWorkItem(id, request));
    }

    private com.aiclub.platform.domain.model.UserEntity requireCurrentUser() {
        Long userId = AuthContextHolder.get().map(AuthContext::userId)
                .orElseThrow(() -> new IllegalArgumentException("当前用户不存在"));
        return userRepository.findWithDetailsById(userId)
                .orElseThrow(() -> new IllegalArgumentException("当前用户不存在: " + userId));
    }
}
