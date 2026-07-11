package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.ExecutionTaskService;
import com.aiclub.platform.service.TechnicalDesignCreditSettlementService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 公众端技术设计执行入口，在创建执行任务前完成整次 Runtime 的积分预扣。
 */
@RestController
@RequestMapping("/api/public/tasks")
public class PublicTechnicalDesignExecutionController {

    private final ExecutionTaskService executionTaskService;
    private final TechnicalDesignCreditSettlementService technicalDesignCreditSettlementService;

    public PublicTechnicalDesignExecutionController(ExecutionTaskService executionTaskService,
                                                     TechnicalDesignCreditSettlementService technicalDesignCreditSettlementService) {
        this.executionTaskService = executionTaskService;
        this.technicalDesignCreditSettlementService = technicalDesignCreditSettlementService;
    }

    @PostMapping("/{id}/technical-design-executions")
    @RequirePermission("task:execution:create")
    public ApiResponse<ExecutionTaskSummary> create(@PathVariable Long id,
                                                    @Valid @RequestBody CreateExecutionTaskRequest request) {
        Long userId = AuthContextHolder.get()
                .map(context -> context.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        ExecutionTaskSummary summary = technicalDesignCreditSettlementService.chargeAndCreate(
                userId,
                id,
                () -> executionTaskService.createPublicTechnicalDesignExecution(id, request)
        );
        return ApiResponse.success(summary);
    }
}
