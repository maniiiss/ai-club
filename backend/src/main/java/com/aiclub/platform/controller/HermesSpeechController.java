package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.HermesSpeechTranscriptionResponse;
import com.aiclub.platform.service.HermesSpeechTranscriptionService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Hermes 语音输入的转写控制器。
 */
@RestController
@RequestMapping("/api/hermes/speech")
@OperationLog(skip = true)
public class HermesSpeechController {

    private final HermesSpeechTranscriptionService hermesSpeechTranscriptionService;

    public HermesSpeechController(HermesSpeechTranscriptionService hermesSpeechTranscriptionService) {
        this.hermesSpeechTranscriptionService = hermesSpeechTranscriptionService;
    }

    /**
     * 把当前用户在 Hermes 抽屉中录制的短语音转成文本，供前端回填到输入框。
     */
    @PostMapping("/transcriptions")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesSpeechTranscriptionResponse> transcribe(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(new HermesSpeechTranscriptionResponse(
                hermesSpeechTranscriptionService.transcribe(file)
        ));
    }
}
