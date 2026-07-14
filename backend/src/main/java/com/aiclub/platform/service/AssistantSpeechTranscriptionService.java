package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;

/**
 * Assistant 语音转写服务。
 * 该服务只做临时音频校验和 OpenAI 兼容 API 转发，不保存原始录音文件。
 */
@Service
public class AssistantSpeechTranscriptionService {

    private static final Logger log = LoggerFactory.getLogger(AssistantSpeechTranscriptionService.class);

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("webm", "wav", "mp3", "m4a");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "audio/webm",
            "audio/wav",
            "audio/x-wav",
            "audio/wave",
            "audio/mpeg",
            "audio/mp3",
            "audio/mp4",
            "audio/m4a",
            "audio/x-m4a"
    );

    private final AssistantSpeechProperties assistantSpeechProperties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public AssistantSpeechTranscriptionService(AssistantSpeechProperties assistantSpeechProperties,
                                            ObjectMapper objectMapper) {
        this.assistantSpeechProperties = assistantSpeechProperties;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(assistantSpeechProperties.getTimeoutSeconds()).toMillis());
        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }

    /**
     * 把前端录制的短音频转写成文本。
     * 业务意图是把语音输入收口到 Assistant 现有 question 文本链路，避免改动聊天协议。
     */
    public String transcribe(MultipartFile file) {
        validateConfiguration();
        ValidatedAudioFile audioFile = validateFile(file);
        try {
            String responseBody = requestTranscription(audioFile, "auto");
            String text = extractTextOrNull(responseBody);
            if (hasText(text)) {
                return text;
            }

            // 对中文办公场景做一次显式语言兜底，避免 auto 判断失手时直接回空文本。
            String zhResponseBody = requestTranscription(audioFile, "zh");
            String zhText = extractTextOrNull(zhResponseBody);
            if (hasText(zhText)) {
                return zhText;
            }

            log.warn("Assistant speech transcription returned empty text: fileName={}, contentType={}, size={}, autoResponse={}, zhResponse={}",
                    audioFile.fileName(),
                    audioFile.contentType(),
                    audioFile.bytes().length,
                    abbreviate(responseBody),
                    abbreviate(zhResponseBody));
            logWavDiagnostics(audioFile);
            throw new IllegalArgumentException("GitPilot 语音转写失败：服务未返回有效文本，请尽量靠近麦克风并完整说一句话");
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (HttpStatusCodeException exception) {
            throw new IllegalArgumentException("GitPilot 语音转写失败：" + extractErrorMessage(exception.getResponseBodyAsString()));
        } catch (ResourceAccessException exception) {
            throw new IllegalArgumentException("GitPilot 语音转写失败，请稍后重试");
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitPilot 语音转写失败，请稍后重试");
        }
    }

    private void validateConfiguration() {
        if (!hasText(assistantSpeechProperties.getApiKey())) {
            throw new IllegalArgumentException("请先配置 GitPilot 语音转写 API Key");
        }
        if (!hasText(assistantSpeechProperties.getBaseUrl())) {
            throw new IllegalArgumentException("请先配置 GitPilot 语音转写服务地址");
        }
        if (!hasText(assistantSpeechProperties.getModel())) {
            throw new IllegalArgumentException("请先配置 GitPilot 语音转写模型");
        }
    }

    private ValidatedAudioFile validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("语音文件不能为空");
        }
        if (file.getSize() > assistantSpeechProperties.getMaxFileSize().toBytes()) {
            throw new IllegalArgumentException("语音文件大小不能超过" + assistantSpeechProperties.getMaxFileSize().toMegabytes() + "MB");
        }
        String extension = resolveExtension(file);
        String contentType = normalizeContentType(file.getContentType(), extension);
        if (!ALLOWED_EXTENSIONS.contains(extension) || !ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("仅支持 WEBM、WAV、MP3、M4A 语音文件");
        }
        try {
            return new ValidatedAudioFile(
                    "hermes-voice." + extension,
                    contentType,
                    file.getBytes()
            );
        } catch (IOException exception) {
            throw new IllegalArgumentException("读取语音文件失败");
        }
    }

    private String resolveExtension(MultipartFile file) {
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null) {
            int dotIndex = originalFilename.lastIndexOf('.');
            if (dotIndex >= 0 && dotIndex < originalFilename.length() - 1) {
                return originalFilename.substring(dotIndex + 1).trim().toLowerCase(Locale.ROOT);
            }
        }
        String contentType = normalizeMimeType(file.getContentType());
        return switch (contentType) {
            case "audio/webm" -> "webm";
            case "audio/wav", "audio/x-wav", "audio/wave" -> "wav";
            case "audio/mpeg", "audio/mp3" -> "mp3";
            case "audio/mp4", "audio/m4a", "audio/x-m4a" -> "m4a";
            default -> "";
        };
    }

    private String normalizeContentType(String contentType, String extension) {
        String normalized = normalizeMimeType(contentType);
        if (hasText(normalized)) {
            return normalized;
        }
        return switch (extension) {
            case "webm" -> "audio/webm";
            case "wav" -> "audio/wav";
            case "mp3" -> "audio/mpeg";
            case "m4a" -> "audio/mp4";
            default -> "";
        };
    }

    private String normalizeMimeType(String contentType) {
        if (!hasText(contentType)) {
            return "";
        }
        return contentType.trim()
                .toLowerCase(Locale.ROOT)
                .split(";", 2)[0]
                .trim();
    }

    private String requestTranscription(ValidatedAudioFile audioFile, String language) {
        String responseBody = restClient.post()
                .uri(assistantSpeechProperties.getBaseUrl() + "/audio/transcriptions")
                .headers(headers -> headers.setBearerAuth(assistantSpeechProperties.getApiKey()))
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(buildMultipartBody(audioFile, language))
                .retrieve()
                .body(String.class);
        return responseBody == null ? "" : responseBody;
    }

    /**
     * 使用 Spring 原生 multipart 编码，兼容 FastAPI/OpenAI 风格的上传接口。
     */
    private MultiValueMap<String, Object> buildMultipartBody(ValidatedAudioFile audioFile, String language) {
        MultiValueMap<String, Object> formData = new LinkedMultiValueMap<>();
        formData.add("model", assistantSpeechProperties.getModel());
        formData.add("response_format", "json");
        if (hasText(language)) {
            formData.add("language", language);
        }

        ByteArrayResource resource = new ByteArrayResource(audioFile.bytes()) {
            @Override
            public String getFilename() {
                return audioFile.fileName();
            }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.parseMediaType(audioFile.contentType()));
        formData.add("file", new HttpEntity<>(resource, partHeaders));
        return formData;
    }

    private String extractTextOrNull(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            String text = root.path("text").asText("").trim();
            return hasText(text) ? text : null;
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitPilot 语音转写失败：响应格式不正确");
        }
    }

    private String extractErrorMessage(String body) {
        if (!hasText(body)) {
            return "上游服务暂时不可用";
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            String message = root.path("error").path("message").asText("").trim();
            if (hasText(message)) {
                return message;
            }
        } catch (Exception ignored) {
        }
        String compactBody = body.replaceAll("\\s+", " ").trim();
        return compactBody.length() > 180 ? compactBody.substring(0, 180) : compactBody;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String abbreviate(String value) {
        if (!hasText(value)) {
            return "";
        }
        String compact = value.replaceAll("\\s+", " ").trim();
        return compact.length() > 240 ? compact.substring(0, 240) : compact;
    }

    /**
     * 识别空文本时记录 WAV 关键元信息，帮助区分“格式不兼容”和“音量接近静音”两类问题。
     */
    private void logWavDiagnostics(ValidatedAudioFile audioFile) {
        if (!"audio/wav".equalsIgnoreCase(audioFile.contentType()) && !"audio/x-wav".equalsIgnoreCase(audioFile.contentType())) {
            return;
        }
        byte[] bytes = audioFile.bytes();
        if (bytes.length < 44) {
            log.warn("Assistant speech wav diagnostics: file too small, size={}", bytes.length);
            return;
        }
        int channelCount = readUnsignedShort(bytes, 22);
        long sampleRate = readUnsignedInt(bytes, 24);
        int bitsPerSample = readUnsignedShort(bytes, 34);
        int dataSize = (int) Math.min(readUnsignedInt(bytes, 40), Math.max(0, bytes.length - 44));
        int peak = 0;
        long absoluteSum = 0;
        int sampleCount = 0;
        if (bitsPerSample == 16) {
            for (int offset = 44; offset + 1 < bytes.length && offset - 44 < dataSize; offset += 2) {
                int sample = (short) ((bytes[offset] & 0xff) | (bytes[offset + 1] << 8));
                int absolute = Math.abs(sample);
                peak = Math.max(peak, absolute);
                absoluteSum += absolute;
                sampleCount += 1;
            }
        }
        double normalizedPeak = peak / 32768.0d;
        double normalizedMeanAbs = sampleCount == 0 ? 0 : (absoluteSum / (double) sampleCount) / 32768.0d;
        double durationSeconds = sampleRate <= 0 || channelCount <= 0 || bitsPerSample <= 0
                ? 0
                : dataSize / (sampleRate * channelCount * (bitsPerSample / 8.0d));
        log.warn("Assistant speech wav diagnostics: channels={}, sampleRate={}, bitsPerSample={}, durationSeconds={}, normalizedPeak={}, normalizedMeanAbs={}",
                channelCount,
                sampleRate,
                bitsPerSample,
                String.format(Locale.ROOT, "%.3f", durationSeconds),
                String.format(Locale.ROOT, "%.5f", normalizedPeak),
                String.format(Locale.ROOT, "%.5f", normalizedMeanAbs));
    }

    private int readUnsignedShort(byte[] bytes, int offset) {
        if (offset + 1 >= bytes.length) {
            return 0;
        }
        return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
    }

    private long readUnsignedInt(byte[] bytes, int offset) {
        if (offset + 3 >= bytes.length) {
            return 0;
        }
        return ((long) bytes[offset] & 0xff)
                | (((long) bytes[offset + 1] & 0xff) << 8)
                | (((long) bytes[offset + 2] & 0xff) << 16)
                | (((long) bytes[offset + 3] & 0xff) << 24);
    }

    private record ValidatedAudioFile(
            String fileName,
            String contentType,
            byte[] bytes
    ) {
    }
}
