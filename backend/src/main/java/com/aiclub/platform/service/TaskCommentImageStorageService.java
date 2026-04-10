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

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class TaskCommentImageStorageService {

    private static final DateTimeFormatter PATH_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "gif");
    private static final String DEFAULT_DIRECTORY = "task-comments";

    private final MinioClient minioClient;
    private final String bucketName;
    private final DataSize maxImageSize;

    private volatile boolean bucketReady = false;

    public TaskCommentImageStorageService(@Value("${platform.upload.minio.endpoint}") String endpoint,
                                          @Value("${platform.upload.minio.access-key}") String accessKey,
                                          @Value("${platform.upload.minio.secret-key}") String secretKey,
                                          @Value("${platform.upload.minio.bucket}") String bucketName,
                                          @Value("${platform.upload.max-image-size:5MB}") DataSize maxImageSize) {
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
        this.bucketName = bucketName;
        this.maxImageSize = maxImageSize;
    }

    public StoredCommentImage store(MultipartFile file) {
        return store(file, DEFAULT_DIRECTORY);
    }

    /**
     * 按业务目录保存图片资源，让任务评论和用户头像共用同一套上传链路。
     */
    public StoredCommentImage store(MultipartFile file, String directoryName) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传图片不能为空");
        }
        if (file.getSize() > maxImageSize.toBytes()) {
            throw new IllegalArgumentException("图片大小不能超过" + maxImageSize.toMegabytes() + "MB");
        }

        String contentType = normalizeContentType(file.getContentType());
        byte[] bytes = readBytes(file);
        validateImage(bytes);
        ensureBucketReady();

        String extension = resolveExtension(file.getOriginalFilename(), contentType);
        String objectKey = normalizeDirectoryName(directoryName) + "/" + PATH_DATE_FORMATTER.format(LocalDate.now()) + "/"
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
        } catch (Exception ex) {
            throw new IllegalArgumentException("保存上传图片失败");
        }

        return new StoredCommentImage(objectKey, defaultFileName(file.getOriginalFilename()), file.getSize(), contentType);
    }

    public StoredCommentImageContent load(String objectKey) {
        if (!StringUtils.hasText(objectKey)) {
            throw new IllegalArgumentException("图片标识不能为空");
        }
        try (InputStream inputStream = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(bucketName)
                        .object(objectKey)
                        .build()
        )) {
            byte[] bytes = inputStream.readAllBytes();
            return new StoredCommentImageContent(bytes, detectContentType(objectKey, bytes));
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("读取图片失败");
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new IllegalArgumentException("读取上传图片失败");
        }
    }

    private void validateImage(byte[] bytes) {
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
            if (ImageIO.read(inputStream) == null) {
                throw new IllegalArgumentException("上传文件不是有效图片");
            }
        } catch (IOException ex) {
            throw new IllegalArgumentException("读取上传图片失败");
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
            } catch (Exception ex) {
                throw new IllegalArgumentException("初始化对象存储失败");
            }
        }
    }

    /**
     * 统一清洗业务目录，避免上传路径中出现前后斜杠导致对象键不规范。
     */
    private String normalizeDirectoryName(String directoryName) {
        if (!StringUtils.hasText(directoryName)) {
            return DEFAULT_DIRECTORY;
        }
        return directoryName.trim()
                .replace("\\", "/")
                .replaceAll("^/+", "")
                .replaceAll("/+$", "");
    }

    private String normalizeContentType(String contentType) {
        String normalized = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
        if (!normalized.startsWith("image/")) {
            throw new IllegalArgumentException("仅支持上传图片文件");
        }
        return normalized;
    }

    private String resolveExtension(String originalFilename, String contentType) {
        String extension = StringUtils.getFilenameExtension(originalFilename);
        if (extension != null) {
            extension = extension.toLowerCase(Locale.ROOT);
        }
        if (extension == null || !ALLOWED_EXTENSIONS.contains(extension)) {
            extension = switch (contentType) {
                case "image/png" -> "png";
                case "image/jpeg", "image/jpg" -> "jpg";
                case "image/gif" -> "gif";
                default -> null;
            };
        }
        if (extension == null || !ALLOWED_EXTENSIONS.contains(extension)) {
            throw new IllegalArgumentException("仅支持 PNG、JPG、GIF 图片");
        }
        return extension;
    }

    private String detectContentType(String objectKey, byte[] bytes) {
        try {
            String detected = java.net.URLConnection.guessContentTypeFromStream(new ByteArrayInputStream(bytes));
            if (StringUtils.hasText(detected)) {
                return detected;
            }
        } catch (IOException ignored) {
        }
        String extension = StringUtils.getFilenameExtension(objectKey);
        if (extension == null) {
            return "application/octet-stream";
        }
        return switch (extension.toLowerCase(Locale.ROOT)) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            default -> "application/octet-stream";
        };
    }

    private String defaultFileName(String originalFilename) {
        return StringUtils.hasText(originalFilename) ? originalFilename : "image";
    }

    public record StoredCommentImage(
            String objectKey,
            String fileName,
            long size,
            String contentType
    ) {
    }

    public record StoredCommentImageContent(
            byte[] bytes,
            String contentType
    ) {
    }
}
