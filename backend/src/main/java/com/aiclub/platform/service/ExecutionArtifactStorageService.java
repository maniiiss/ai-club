package com.aiclub.platform.service;

import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URLConnection;

/**
 * 执行产物对象存储读取服务。
 * 当前第一版只负责读取 code-processing 已经上传到 MinIO 的扫描报告文件。
 */
@Service
public class ExecutionArtifactStorageService {

    private final MinioClient minioClient;
    private final String bucketName;

    public ExecutionArtifactStorageService(@Value("${platform.upload.minio.endpoint}") String endpoint,
                                           @Value("${platform.upload.minio.access-key}") String accessKey,
                                           @Value("${platform.upload.minio.secret-key}") String secretKey,
                                           @Value("${platform.upload.minio.bucket}") String bucketName) {
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
        this.bucketName = bucketName;
    }

    /**
     * 按对象键读取执行产物内容。
     */
    public StoredArtifactContent load(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            throw new IllegalArgumentException("执行产物对象键不能为空");
        }
        try (InputStream inputStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(bucketName)
                        .object(objectKey)
                        .build()
        )) {
            byte[] bytes = inputStream.readAllBytes();
            return new StoredArtifactContent(bytes, detectContentType(objectKey, bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("读取执行产物失败", exception);
        }
    }

    /**
     * 优先根据内容猜测类型，失败后再回退到文件扩展名。
     */
    private String detectContentType(String objectKey, byte[] bytes) {
        try {
            String detected = URLConnection.guessContentTypeFromStream(new java.io.ByteArrayInputStream(bytes));
            if (detected != null && !detected.isBlank()) {
                return detected;
            }
        } catch (Exception ignored) {
        }
        String lowerCaseKey = objectKey.toLowerCase();
        if (lowerCaseKey.endsWith(".html")) {
            return "text/html";
        }
        if (lowerCaseKey.endsWith(".md")) {
            return "text/markdown";
        }
        if (lowerCaseKey.endsWith(".sarif") || lowerCaseKey.endsWith(".sarif.json")) {
            return "application/json";
        }
        if (lowerCaseKey.endsWith(".json")) {
            return "application/json";
        }
        if (lowerCaseKey.endsWith(".log")) {
            return "text/plain";
        }
        return "application/octet-stream";
    }

    public record StoredArtifactContent(byte[] bytes, String contentType) {
    }
}
