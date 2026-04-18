package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 调用 code-processing 文档转 Markdown 接口的客户端。
 * 这里沿用 JDK HttpClient，避免额外引入 WebFlux 依赖。
 */
@Service
public class DocumentMarkdownClientService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final InternalServiceAuthenticator internalServiceAuthenticator;

    @Autowired
    public DocumentMarkdownClientService(ObjectMapper objectMapper,
                                         InternalServiceAuthenticator internalServiceAuthenticator,
                                         @Value("${platform.code-processing.base-url}") String baseUrl) {
        this(
                objectMapper,
                internalServiceAuthenticator,
                baseUrl,
                HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(Duration.ofSeconds(10))
                        .build()
        );
    }

    DocumentMarkdownClientService(ObjectMapper objectMapper,
                                  InternalServiceAuthenticator internalServiceAuthenticator,
                                  String baseUrl,
                                  HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = httpClient;
    }

    /**
     * 发送 multipart 文档到 code-processing 并解析转换结果。
     */
    public ConvertDocumentResponse convert(byte[] bytes,
                                           String fileName,
                                           String contentType,
                                           String scene,
                                           Integer maxChars,
                                           String imageDirectory) {
        try {
            String boundary = "----AiClubBoundary" + UUID.randomUUID().toString().replace("-", "");
            byte[] body = buildMultipartBody(boundary, bytes, fileName, contentType, scene, maxChars, imageDirectory);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/documents/convert"))
                    .timeout(Duration.ofSeconds(120))
                    .header("Authorization", internalServiceAuthenticator.authorizationHeaderValue())
                    .header("Accept", "application/json")
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException(buildErrorMessage(response.body(), response.statusCode()));
            }
            JsonNode root = objectMapper.readTree(response.body() == null ? "{}" : response.body());
            List<String> warnings = new ArrayList<>();
            JsonNode warningsNode = root.path("warnings");
            if (warningsNode.isArray()) {
                warningsNode.forEach(item -> warnings.add(item.asText("")));
            }
            return new ConvertDocumentResponse(
                    root.path("suggestedTitle").asText(""),
                    root.path("markdown").asText(""),
                    root.path("sourceFormat").asText(""),
                    root.path("truncated").asBoolean(false),
                    warnings
            );
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("调用文档转换服务失败", exception);
        }
    }

    byte[] buildMultipartBody(String boundary,
                              byte[] bytes,
                              String fileName,
                              String contentType,
                              String scene,
                              Integer maxChars,
                              String imageDirectory) throws IOException {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        writeTextPart(outputStream, boundary, "scene", scene == null ? "" : scene.trim());
        if (maxChars != null) {
            writeTextPart(outputStream, boundary, "maxChars", String.valueOf(maxChars));
        }
        if (imageDirectory != null && !imageDirectory.isBlank()) {
            writeTextPart(outputStream, boundary, "imageDirectory", imageDirectory.trim());
        }
        outputStream.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + defaultFileName(fileName) + "\"\r\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(("Content-Type: " + normalizeContentType(contentType) + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(bytes == null ? new byte[0] : bytes);
        outputStream.write("\r\n".getBytes(StandardCharsets.UTF_8));
        outputStream.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return outputStream.toByteArray();
    }

    private void writeTextPart(ByteArrayOutputStream outputStream, String boundary, String name, String value) throws IOException {
        outputStream.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
        outputStream.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return "application/octet-stream";
        }
        return contentType.trim();
    }

    private String defaultFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "document";
        }
        return fileName.trim().replace("\"", "");
    }

    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (node.hasNonNull("detail")) {
                return "文档转换服务调用失败，HTTP " + statusCode + "：" + node.get("detail").asText();
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            return "文档转换服务调用失败，HTTP " + statusCode + "：" + responseBody.trim();
        }
        return "文档转换服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    public record ConvertDocumentResponse(
            String suggestedTitle,
            String markdown,
            String sourceFormat,
            boolean truncated,
            List<String> warnings
    ) {
        public ConvertDocumentResponse {
            warnings = warnings == null ? List.of() : List.copyOf(warnings);
        }
    }
}
