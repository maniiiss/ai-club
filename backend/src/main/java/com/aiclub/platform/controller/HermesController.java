package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.HermesChatResponse;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.service.HermesChatService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Hermes 平台内置助手的专用控制器。
 */
@RestController
@RequestMapping("/api/hermes")
public class HermesController {

    private final HermesChatService hermesChatService;

    public HermesController(HermesChatService hermesChatService) {
        this.hermesChatService = hermesChatService;
    }

    /**
     * 顶部 Hermes 助手的稳定非流式问答入口。
     */
    @PostMapping("/chat")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesChatResponse> chat(@Valid @RequestBody HermesChatRequest request) {
        return ApiResponse.success(hermesChatService.chat(request));
    }

    /**
     * 顶部 Hermes 助手的统一流式问答入口。
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission("hermes:chat")
    public ResponseEntity<StreamingResponseBody> streamChat(@Valid @RequestBody HermesChatRequest request) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(hermesChatService.streamChat(request));
    }
}
