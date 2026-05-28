package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AiClubPipelineTriggerResult;
import com.aiclub.platform.service.CicdManagementService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI Club Pipeline 的公开 webhook 入口。
 * 该入口不依赖登录态，只接受预生成 token 的固定配置触发。
 */
@RestController
@RequestMapping("/api/cicd/public")
public class CicdWebhookController {

    private final CicdManagementService cicdManagementService;

    public CicdWebhookController(CicdManagementService cicdManagementService) {
        this.cicdManagementService = cicdManagementService;
    }

    @PostMapping("/pipelines/{id}/trigger/{token}")
    public ApiResponse<AiClubPipelineTriggerResult> triggerAiClubPipelineByWebhook(@PathVariable Long id,
                                                                                   @PathVariable String token) {
        return ApiResponse.success(cicdManagementService.triggerAiClubPipelineByWebhook(id, token));
    }
}
