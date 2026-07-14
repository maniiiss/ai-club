package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AssistantSpeechTranscriptionResponse;
import com.aiclub.platform.service.AssistantSpeechTranscriptionService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Assistant 语音输入的转写控制器。
 */
@RestController
@RequestMapping("/api/assistant/speech")
@OperationLog(skip = true)
public class AssistantSpeechController {

    private final AssistantSpeechTranscriptionService assistantSpeechTranscriptionService;

    public AssistantSpeechController(AssistantSpeechTranscriptionService assistantSpeechTranscriptionService) {
        this.assistantSpeechTranscriptionService = assistantSpeechTranscriptionService;
    }

    /**
     * 把当前用户在 Assistant 抽屉中录制的短语音转成文本，供前端回填到输入框。
     */
    @PostMapping("/transcriptions")
    @RequirePermission("hermes:chat")
    public ApiResponse<AssistantSpeechTranscriptionResponse> transcribe(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(new AssistantSpeechTranscriptionResponse(
                assistantSpeechTranscriptionService.transcribe(file)
        ));
    }
}
