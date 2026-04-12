package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.request.CreateFeedbackRequest;
import com.aiclub.platform.service.FeedbackService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 提供用户反馈提交接口。
 */
@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {

    private final FeedbackService feedbackService;

    public FeedbackController(FeedbackService feedbackService) {
        this.feedbackService = feedbackService;
    }

    /**
     * 接收当前登录用户填写的反馈并保存入库。
     */
    @PostMapping
    public ApiResponse<Void> createFeedback(@Valid @RequestBody CreateFeedbackRequest request) {
        feedbackService.createFeedback(request);
        return ApiResponse.success(null);
    }
}
