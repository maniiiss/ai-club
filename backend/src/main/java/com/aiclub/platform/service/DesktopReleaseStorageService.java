package com.aiclub.platform.service;

import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.http.Method;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

/**
 * Desktop 发布产物对象存储服务。
 * 业务意图：安装包可能达到数十 MB，上传必须直接流入 MinIO，公开访问只能通过短期签名 URL。
 */
@Service
public class DesktopReleaseStorageService {

    private static final long SIGNATURE_MAX_BYTES = 1024 * 1024;
    private final MinioClient minioClient;
    private final String bucketName;
    private final DataSize maxReleaseArtifactSize;
    private volatile boolean bucketReady;

    public DesktopReleaseStorageService(
            @Value("${platform.upload.minio.endpoint}") String endpoint,
            @Value("${platform.upload.minio.access-key}") String accessKey,
            @Value("${platform.upload.minio.secret-key}") String secretKey,
            @Value("${platform.upload.minio.bucket}") String bucketName,
            @Value("${platform.desktop-release.max-artifact-size:300MB}") DataSize maxReleaseArtifactSize) {
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
        this.bucketName = bucketName;
        this.maxReleaseArtifactSize = maxReleaseArtifactSize;
    }

    /** 将管理员上传的产物流式写入发布专用对象前缀，并计算 SHA-256。 */
    public StoredReleaseArtifact store(MultipartFile file, Long releaseId, String artifactKind) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("桌面发布产物不能为空");
        }
        if (file.getSize() <= 0 || file.getSize() > maxReleaseArtifactSize.toBytes()) {
            throw new IllegalArgumentException("桌面发布产物大小必须在 1B 至 " + maxReleaseArtifactSize.toMegabytes() + "MB 之间");
        }
        String fileName = safeFileName(file.getOriginalFilename());
        String contentType = resolveContentType(file.getContentType(), fileName);
        String signatureText = "SIGNATURE".equals(artifactKind) ? readSignature(file) : "";
        String objectKey = "desktop-releases/" + releaseId + "/" + UUID.randomUUID().toString().replace("-", "") + "/" + fileName;
        ensureBucketReady();

        try (InputStream source = file.getInputStream(); DigestInputStream digestInputStream = new DigestInputStream(source, MessageDigest.getInstance("SHA-256"))) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .stream(digestInputStream, file.getSize(), -1)
                    .contentType(contentType)
                    .build());
            String sha256 = HexFormat.of().formatHex(digestInputStream.getMessageDigest().digest());
            return new StoredReleaseArtifact(objectKey, fileName, contentType, file.getSize(), sha256, signatureText);
        } catch (NoSuchAlgorithmException | IOException exception) {
            throw new IllegalArgumentException("读取桌面发布产物失败", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("保存桌面发布产物失败", exception);
        }
    }

    /** 生成短期公开下载地址；MinIO bucket 本身始终保持私有。 */
    public String presignedDownloadUrl(String objectKey) {
        if (!StringUtils.hasText(objectKey)) {
            throw new IllegalArgumentException("桌面发布对象键不能为空");
        }
        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucketName)
                    .object(objectKey)
                    .expiry(15 * 60)
                    .build());
        } catch (Exception exception) {
            throw new IllegalStateException("生成桌面发布下载地址失败", exception);
        }
    }

    /** 替换草稿产物时清理旧对象，避免 MinIO 长期堆积不可见文件。 */
    public void delete(String objectKey) {
        if (!StringUtils.hasText(objectKey)) return;
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucketName).object(objectKey).build());
        } catch (Exception exception) {
            throw new IllegalStateException("清理旧桌面发布产物失败", exception);
        }
    }

    private void ensureBucketReady() {
        if (bucketReady) return;
        synchronized (this) {
            if (bucketReady) return;
            try {
                if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build())) {
                    minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                }
                bucketReady = true;
            } catch (Exception exception) {
                throw new IllegalStateException("初始化桌面发布对象存储失败", exception);
            }
        }
    }

    private String readSignature(MultipartFile file) {
        if (file.getSize() > SIGNATURE_MAX_BYTES) {
            throw new IllegalArgumentException("Tauri 签名文件不能超过1MB");
        }
        try {
            String signature = new String(file.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (signature.isBlank()) throw new IllegalArgumentException("Tauri 签名文件不能为空");
            return signature;
        } catch (IOException exception) {
            throw new IllegalArgumentException("读取 Tauri 签名文件失败", exception);
        }
    }

    private String safeFileName(String originalFilename) {
        String name = StringUtils.hasText(originalFilename) ? originalFilename.trim() : "desktop-artifact";
        name = name.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[^A-Za-z0-9._-]", "_");
        if (name.isBlank() || name.equals(".") || name.equals("..")) return "desktop-artifact";
        return name;
    }

    private String resolveContentType(String contentType, String fileName) {
        if (StringUtils.hasText(contentType)) return contentType.trim().toLowerCase(Locale.ROOT);
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".msi")) return "application/x-msi";
        if (lower.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
        if (lower.endsWith(".zip")) return "application/zip";
        if (lower.endsWith(".sig")) return "text/plain";
        return "application/octet-stream";
    }

    public record StoredReleaseArtifact(
            String objectKey,
            String fileName,
            String contentType,
            long fileSize,
            String sha256,
            String signatureText
    ) {
    }
}
