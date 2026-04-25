package com.aiclub.platform.dto;

/**
 * Hermes 语音转写接口返回给前端的文本结果。
 */
public record HermesSpeechTranscriptionResponse(
        String text
) {
    public HermesSpeechTranscriptionResponse {
        text = text == null ? "" : text.trim();
    }
}
