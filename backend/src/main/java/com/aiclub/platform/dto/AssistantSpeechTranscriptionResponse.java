package com.aiclub.platform.dto;

/**
 * Assistant 语音转写接口返回给前端的文本结果。
 */
public record AssistantSpeechTranscriptionResponse(
        String text
) {
    public AssistantSpeechTranscriptionResponse {
        text = text == null ? "" : text.trim();
    }
}
