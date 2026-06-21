package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CreditAccountSummary;
import com.aiclub.platform.dto.CreditFeatureConfigSummary;
import com.aiclub.platform.dto.CreditGlobalConfigSummary;
import com.aiclub.platform.dto.CreditTransactionSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreditAdjustmentRequest;
import com.aiclub.platform.dto.request.CreditFeatureConfigRequest;
import com.aiclub.platform.dto.request.CreditGlobalConfigRequest;
import com.aiclub.platform.service.CreditService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 积分管理与公众端积分查询接口。
 */
@RestController
@RequestMapping("/api/credits")
@OperationLog(moduleCode = "CREDIT", moduleName = "积分管理", bizType = "CREDIT")
public class CreditController {

    private final CreditService creditService;

    public CreditController(CreditService creditService) {
        this.creditService = creditService;
    }

    @GetMapping("/config")
    @RequirePermission("system:credit:view")
    public ApiResponse<CreditGlobalConfigSummary> getGlobalConfig() {
        return ApiResponse.success(creditService.getGlobalConfig());
    }

    @PutMapping("/config")
    @RequirePermission("system:credit:manage")
    @OperationLog(actionCode = "CREDIT_CONFIG_UPDATE", actionName = "更新积分全局配置")
    public ApiResponse<CreditGlobalConfigSummary> updateGlobalConfig(@Valid @RequestBody CreditGlobalConfigRequest request) {
        return ApiResponse.success(creditService.updateGlobalConfig(request));
    }

    @GetMapping("/features")
    @RequirePermission("system:credit:view")
    public ApiResponse<List<CreditFeatureConfigSummary>> listFeatureConfigs() {
        return ApiResponse.success(creditService.listFeatureConfigs());
    }

    @PostMapping("/features")
    @RequirePermission("system:credit:manage")
    @OperationLog(actionCode = "CREDIT_FEATURE_SAVE", actionName = "保存积分功能扣费配置")
    public ApiResponse<CreditFeatureConfigSummary> saveFeatureConfig(@Valid @RequestBody CreditFeatureConfigRequest request) {
        return ApiResponse.success(creditService.saveFeatureConfig(request));
    }

    @GetMapping("/accounts")
    @RequirePermission("system:credit:view")
    public ApiResponse<PageResponse<CreditAccountSummary>> pageAccounts(@RequestParam(defaultValue = "1") int page,
                                                                        @RequestParam(defaultValue = "10") int size,
                                                                        @RequestParam(required = false) String keyword) {
        return ApiResponse.success(creditService.pageAccounts(page, size, keyword));
    }

    @PostMapping("/accounts/{userId}/adjust")
    @RequirePermission("system:credit:manage")
    @OperationLog(actionCode = "CREDIT_ACCOUNT_ADJUST", actionName = "调整用户积分", bizIdParam = "userId")
    public ApiResponse<CreditAccountSummary> adjustAccount(@PathVariable Long userId,
                                                           @Valid @RequestBody CreditAdjustmentRequest request) {
        return ApiResponse.success(creditService.adjustAccount(userId, request));
    }

    @GetMapping("/accounts/{userId}/transactions")
    @RequirePermission("system:credit:view")
    public ApiResponse<PageResponse<CreditTransactionSummary>> pageAccountTransactions(@PathVariable Long userId,
                                                                                       @RequestParam(defaultValue = "1") int page,
                                                                                       @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(creditService.pageAccountTransactions(userId, page, size));
    }

    @GetMapping("/me")
    public ApiResponse<CreditAccountSummary> getCurrentAccount() {
        return ApiResponse.success(creditService.getCurrentAccount());
    }

    @GetMapping("/me/transactions")
    public ApiResponse<PageResponse<CreditTransactionSummary>> pageCurrentAccountTransactions(@RequestParam(defaultValue = "1") int page,
                                                                                              @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(creditService.pageCurrentAccountTransactions(page, size));
    }
}
