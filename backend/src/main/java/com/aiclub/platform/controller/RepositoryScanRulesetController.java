package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.RepositoryScanRulesetAdminSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetValidationResult;
import com.aiclub.platform.dto.request.RepositoryScanRulesetRequest;
import com.aiclub.platform.dto.request.RepositoryScanRulesetValidationRequest;
import com.aiclub.platform.service.RepositoryScanRulesetService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仓库扫描规则集管理控制器。
 * 提供后台独立菜单的规则集查看与维护能力。
 */
@RestController
@RequestMapping("/api/repository-scan-rulesets")
@OperationLog(moduleCode = "REPOSITORY_SCAN_RULESET", moduleName = "扫描规则集", bizType = "REPOSITORY_SCAN_RULESET")
public class RepositoryScanRulesetController {

    private final RepositoryScanRulesetService repositoryScanRulesetService;

    public RepositoryScanRulesetController(RepositoryScanRulesetService repositoryScanRulesetService) {
        this.repositoryScanRulesetService = repositoryScanRulesetService;
    }

    /**
     * 分页查询规则集列表。
     */
    @GetMapping
    @RequirePermission("scan:ruleset:view")
    public ApiResponse<PageResponse<RepositoryScanRulesetAdminSummary>> page(@RequestParam(defaultValue = "1") int page,
                                                                             @RequestParam(defaultValue = "10") int size,
                                                                             @RequestParam(required = false) String keyword,
                                                                             @RequestParam(required = false) String engineType,
                                                                             @RequestParam(required = false) Boolean enabled) {
        return ApiResponse.success(repositoryScanRulesetService.pageRulesets(page, size, keyword, engineType, enabled));
    }

    /**
     * 查询单条规则集详情。
     */
    @GetMapping("/{id}")
    @RequirePermission("scan:ruleset:view")
    public ApiResponse<RepositoryScanRulesetAdminSummary> detail(@PathVariable Long id) {
        return ApiResponse.success(repositoryScanRulesetService.getRuleset(id));
    }

    /**
     * 创建新的规则集配置。
     */
    @PostMapping
    @RequirePermission("scan:ruleset:manage")
    @OperationLog(actionCode = "REPOSITORY_SCAN_RULESET_CREATE", actionName = "创建扫描规则集")
    public ApiResponse<RepositoryScanRulesetAdminSummary> create(@Valid @RequestBody RepositoryScanRulesetRequest request) {
        return ApiResponse.success(repositoryScanRulesetService.createRuleset(request));
    }

    /**
     * 手动校验规则内容是否可保存。
     */
    @PostMapping("/validate")
    @RequirePermission("scan:ruleset:manage")
    @OperationLog(actionCode = "REPOSITORY_SCAN_RULESET_VALIDATE", actionName = "校验扫描规则集")
    public ApiResponse<RepositoryScanRulesetValidationResult> validate(@Valid @RequestBody RepositoryScanRulesetValidationRequest request) {
        return ApiResponse.success(repositoryScanRulesetService.validateRuleset(request));
    }

    /**
     * 更新既有规则集配置。
     */
    @PutMapping("/{id}")
    @RequirePermission("scan:ruleset:manage")
    @OperationLog(actionCode = "REPOSITORY_SCAN_RULESET_UPDATE", actionName = "更新扫描规则集", bizIdParam = "id")
    public ApiResponse<RepositoryScanRulesetAdminSummary> update(@PathVariable Long id,
                                                                 @Valid @RequestBody RepositoryScanRulesetRequest request) {
        return ApiResponse.success(repositoryScanRulesetService.updateRuleset(id, request));
    }
}
