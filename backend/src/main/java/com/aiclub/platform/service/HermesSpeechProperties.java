package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;

/**
 * Hermes 语音转写的系统级配置。
 * 第一版仅负责接 OpenAI 兼容转写接口，不复用文档资产或模型中心配置。
 */
@Component
public class HermesSpeechProperties {

    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final int timeoutSeconds;
    private final DataSize maxFileSize;

    public HermesSpeechProperties(@Value("${platform.hermes.speech.base-url:https://api.openai.com/v1}") String baseUrl,
                                  @Value("${platform.hermes.speech.api-key:}") String apiKey,
                                  @Value("${platform.hermes.speech.model:gpt-4o-mini-transcribe}") String model,
                                  @Value("${platform.hermes.speech.timeout-seconds:60}") int timeoutSeconds,
                                  @Value("${spring.servlet.multipart.max-file-size:20MB}") DataSize maxFileSize) {
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null || model.trim().isEmpty() ? "gpt-4o-mini-transcribe" : model.trim();
        this.timeoutSeconds = Math.max(10, Math.min(timeoutSeconds, 300));
        this.maxFileSize = maxFileSize == null ? DataSize.ofMegabytes(20) : maxFileSize;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getModel() {
        return model;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    public DataSize getMaxFileSize() {
        return maxFileSize;
    }

    /**
     * 统一去掉尾部斜杠，避免请求地址重复拼接斜杠。
     */
    private String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }
}
