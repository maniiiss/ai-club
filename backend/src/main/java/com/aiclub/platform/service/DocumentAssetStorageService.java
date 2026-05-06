package com.aiclub.platform.service;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * 通用文档资产对象存储服务，统一保存原始文档并按权限控制下载。
 */
@Service
public class DocumentAssetStorageService {

    /** 文档对象键日期目录格式。 */
    private static final DateTimeFormatter PATH_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    /** 第一版允许上传的文档扩展名。 */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("pdf", "docx", "pptx", "xlsx");

    /** 默认保存目录。 */
    private static final String DEFAULT_DIRECTORY = "document-assets";

    private final MinioClient minioClient;
    private final String bucketName;
    private final DataSize maxDocumentSize;

    private volatile boolean bucketReady = false;

    public DocumentAssetStorageService(@Value("${platform.upload.minio.endpoint}") String endpoint,
                                       @Value("${platform.upload.minio.access-key}") String accessKey,
                                       @Value("${platform.upload.minio.secret-key}") String secretKey,
                                       @Value("${platform.upload.minio.bucket}") String bucketName,
                                       @Value("${platform.upload.max-document-size:20MB}") DataSize maxDocumentSize) {
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
        this.bucketName = bucketName;
        this.maxDocumentSize = maxDocumentSize;
    }

    /**
     * 保存上传文档到对象存储。
     */
    public StoredDocumentAsset store(MultipartFile file, String directoryName) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传文档不能为空");
        }
        if (file.getSize() > maxDocumentSize.toBytes()) {
            throw new IllegalArgumentException("文档大小不能超过" + maxDocumentSize.toMegabytes() + "MB");
        }

        String extension = resolveExtension(file.getOriginalFilename());
        String contentType = normalizeContentType(file.getContentType(), extension);
        byte[] bytes = readBytes(file);
        ensureBucketReady();

        String normalizedDirectory = normalizeDirectoryName(directoryName);
        String objectKey = normalizedDirectory + "/" + PATH_DATE_FORMATTER.format(LocalDate.now()) + "/"
                + UUID.randomUUID().toString().replace("-", "") + "." + extension;
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectKey)
                            .stream(inputStream, bytes.length, -1)
                            .contentType(contentType)
                            .build()
            );
        } catch (Exception exception) {
            throw new IllegalArgumentException("保存上传文档失败");
        }
        return new StoredDocumentAsset(
                objectKey,
                defaultFileName(file.getOriginalFilename()),
                contentType,
                file.getSize(),
                extension.toUpperCase(Locale.ROOT)
        );
    }

    /**
     * 保存任意类型文件到对象存储。
     * 通用文件入口不关心文件是否为图片或文档，只负责原样入桶并保留元信息。
     */
    public StoredDocumentAsset storeAnyFile(MultipartFile file, String directoryName) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传文件不能为空");
        }
        if (file.getSize() > maxDocumentSize.toBytes()) {
            throw new IllegalArgumentException("文件大小不能超过" + maxDocumentSize.toMegabytes() + "MB");
        }

        String extension = resolveAnyExtension(file.getOriginalFilename());
        String contentType = normalizeAnyContentType(file.getContentType(), extension);
        byte[] bytes = readBytes(file);
        ensureBucketReady();

        String normalizedDirectory = normalizeDirectoryName(directoryName);
        String objectKey = normalizedDirectory + "/" + PATH_DATE_FORMATTER.format(LocalDate.now()) + "/"
                + UUID.randomUUID().toString().replace("-", "") + (extension.isBlank() ? "" : "." + extension);
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectKey)
                            .stream(inputStream, bytes.length, -1)
                            .contentType(contentType)
                            .build()
            );
        } catch (Exception exception) {
            throw new IllegalArgumentException("保存上传文件失败");
        }
        return new StoredDocumentAsset(
                objectKey,
                defaultFileName(file.getOriginalFilename()),
                contentType,
                file.getSize(),
                extension.isBlank() ? "FILE" : extension.toUpperCase(Locale.ROOT)
        );
    }

    /**
     * 按对象键读取文档原始内容。
     */
    public StoredDocumentContent load(String objectKey) {
        if (!StringUtils.hasText(objectKey)) {
            throw new IllegalArgumentException("文档对象键不能为空");
        }
        try (InputStream inputStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(bucketName)
                        .object(objectKey)
                        .build()
        )) {
            byte[] bytes = inputStream.readAllBytes();
            return new StoredDocumentContent(bytes, detectContentType(objectKey));
        } catch (Exception exception) {
            throw new IllegalArgumentException("读取文档失败");
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new IllegalArgumentException("读取上传文档失败");
        }
    }

    private void ensureBucketReady() {
        if (bucketReady) {
            return;
        }
        synchronized (this) {
            if (bucketReady) {
                return;
            }
            try {
                boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
                if (!exists) {
                    minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                }
                bucketReady = true;
            } catch (Exception exception) {
                throw new IllegalArgumentException("初始化文档对象存储失败");
            }
        }
    }

    private String normalizeDirectoryName(String directoryName) {
        if (!StringUtils.hasText(directoryName)) {
            return DEFAULT_DIRECTORY;
        }
        return directoryName.trim()
                .replace("\\", "/")
                .replaceAll("^/+", "")
                .replaceAll("/+$", "");
    }

    private String resolveExtension(String originalFilename) {
        String extension = StringUtils.getFilenameExtension(originalFilename);
        if (extension == null) {
            throw new IllegalArgumentException("文档缺少文件扩展名");
        }
        String normalized = extension.toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTENSIONS.contains(normalized)) {
            throw new IllegalArgumentException("仅支持 PDF、DOCX、PPTX、XLSX 文档");
        }
        return normalized;
    }

    private String resolveAnyExtension(String originalFilename) {
        String extension = StringUtils.getFilenameExtension(originalFilename);
        if (extension == null) {
            return "";
        }
        return extension.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeContentType(String contentType, String extension) {
        String normalized = contentType == null ? "" : contentType.trim().toLowerCase(Locale.ROOT);
        if (!normalized.isBlank()) {
            return normalized;
        }
        return switch (extension) {
            case "pdf" -> "application/pdf";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            default -> "application/octet-stream";
        };
    }

    private String normalizeAnyContentType(String contentType, String extension) {
        String normalized = contentType == null ? "" : contentType.trim().toLowerCase(Locale.ROOT);
        if (!normalized.isBlank()) {
            return normalized;
        }
        if (extension.isBlank()) {
            return "application/octet-stream";
        }
        return switch (extension) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "pdf" -> "application/pdf";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            default -> "application/octet-stream";
        };
    }

    private String detectContentType(String objectKey) {
        if (!StringUtils.hasText(objectKey)) {
            return "application/octet-stream";
        }
        String lowerCaseKey = objectKey.toLowerCase(Locale.ROOT);
        if (lowerCaseKey.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (lowerCaseKey.endsWith(".docx")) {
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        if (lowerCaseKey.endsWith(".pptx")) {
            return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        }
        if (lowerCaseKey.endsWith(".xlsx")) {
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        }
        return "application/octet-stream";
    }

    private String defaultFileName(String originalFilename) {
        return StringUtils.hasText(originalFilename) ? originalFilename : "document";
    }

    public record StoredDocumentAsset(
            String objectKey,
            String fileName,
            String contentType,
            long fileSize,
            String sourceFormat
    ) {
    }

    public record StoredDocumentContent(
            byte[] bytes,
            String contentType
    ) {
    }
}
