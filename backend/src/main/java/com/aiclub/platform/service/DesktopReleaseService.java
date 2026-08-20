package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DesktopReleaseArtifactEntity;
import com.aiclub.platform.domain.model.DesktopReleaseEntity;
import com.aiclub.platform.dto.DesktopReleaseArtifactSummary;
import com.aiclub.platform.dto.DesktopReleaseDetail;
import com.aiclub.platform.dto.DesktopReleaseLatest;
import com.aiclub.platform.dto.DesktopReleaseSummary;
import com.aiclub.platform.dto.DesktopUpdateManifest;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.DesktopReleaseRequest;
import com.aiclub.platform.repository.DesktopReleaseArtifactRepository;
import com.aiclub.platform.repository.DesktopReleaseRepository;
import com.aiclub.platform.security.AuthContextHolder;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * GitPilot Desktop 发布业务服务。
 * 业务意图：统一管理版本生命周期、产物矩阵和 Tauri 更新清单，公开读取与管理员写入使用同一权威数据源。
 */
@Service
@Transactional
public class DesktopReleaseService {

    public static final String CHANNEL_STABLE = "stable";
    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PUBLISHED = "PUBLISHED";
    public static final String STATUS_REVOKED = "REVOKED";
    public static final String PLATFORM_WINDOWS = "windows";
    public static final String ARCH_X86_64 = "x86_64";
    public static final String ARTIFACT_INSTALLER = "INSTALLER";
    public static final String ARTIFACT_UPDATER = "UPDATER";
    public static final String ARTIFACT_SIGNATURE = "SIGNATURE";
    public static final String ARTIFACT_READY = "READY";

    private static final Pattern SEMVER = Pattern.compile("^v?\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$");
    private final DesktopReleaseRepository releaseRepository;
    private final DesktopReleaseArtifactRepository artifactRepository;
    private final DesktopReleaseStorageService storageService;

    public DesktopReleaseService(DesktopReleaseRepository releaseRepository,
                                 DesktopReleaseArtifactRepository artifactRepository,
                                 DesktopReleaseStorageService storageService) {
        this.releaseRepository = releaseRepository;
        this.artifactRepository = artifactRepository;
        this.storageService = storageService;
    }

    /** 创建草稿，版本号和渠道的唯一性在服务层提前校验并由数据库兜底。 */
    public DesktopReleaseDetail createDraft(DesktopReleaseRequest request) {
        String version = normalizeVersion(request.version());
        String channel = normalizeChannel(request.channel());
        if (!SEMVER.matcher(version).matches()) {
            throw new IllegalArgumentException("桌面版本号必须是 semver，例如 0.2.0");
        }
        if (releaseRepository.existsByVersionCodeIgnoreCaseAndChannel(version, channel)) {
            throw new IllegalArgumentException("桌面版本号已存在: " + version);
        }
        DesktopReleaseEntity entity = new DesktopReleaseEntity();
        entity.setVersionCode(version);
        entity.setChannel(channel);
        entity.setTitle(normalize(request.title()));
        entity.setReleaseNotes(normalizeContent(request.releaseNotes()));
        entity.setStatus(STATUS_DRAFT);
        entity.setPublisherUserId(currentUserId());
        return toDetail(releaseRepository.save(entity));
    }

    /** 管理端分页查看草稿、已发布和已撤回版本。 */
    @Transactional(Transactional.TxType.SUPPORTS)
    public PageResponse<DesktopReleaseSummary> pageAdmin(int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page - 1), Math.max(1, Math.min(size, 50)),
                Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        return PageResponse.from(releaseRepository.findAllByOrderByCreatedAtDescIdDesc(pageable)
                .map(release -> new DesktopReleaseSummary(
                        release.getId(), release.getVersionCode(), release.getChannel(), release.getTitle(),
                        release.getStatus(), release.getPublishedAt(), release.getCreatedAt(),
                        artifactRepository.findAllByReleaseIdOrderByIdAsc(release.getId()).size())));
    }

    @Transactional(Transactional.TxType.SUPPORTS)
    public DesktopReleaseDetail getAdmin(Long id) {
        return toDetail(requireRelease(id));
    }

    /** 上传或替换草稿产物；先写新对象，再删除旧对象，保证替换失败不会丢失旧产物。 */
    public DesktopReleaseArtifactSummary uploadArtifact(Long releaseId,
                                                         String artifactKind,
                                                         String platform,
                                                         String arch,
                                                         String bundleType,
                                                         MultipartFile file) {
        DesktopReleaseEntity release = requireRelease(releaseId);
        requireStatus(release, STATUS_DRAFT);
        String normalizedKind = normalizeArtifactKind(artifactKind);
        String normalizedPlatform = normalizePlatform(platform);
        String normalizedArch = normalizeArch(arch);
        String normalizedBundle = normalizeBundleType(bundleType);
        DesktopReleaseStorageService.StoredReleaseArtifact stored = storageService.store(file, releaseId, normalizedKind);
        Optional<DesktopReleaseArtifactEntity> existing = artifactRepository
                .findByReleaseIdAndArtifactKindAndPlatformAndArchAndBundleType(
                        releaseId, normalizedKind, normalizedPlatform, normalizedArch, normalizedBundle);

        DesktopReleaseArtifactEntity entity = existing.orElseGet(DesktopReleaseArtifactEntity::new);
        String oldObjectKey = entity.getObjectKey();
        entity.setReleaseId(releaseId);
        entity.setArtifactKind(normalizedKind);
        entity.setPlatform(normalizedPlatform);
        entity.setArch(normalizedArch);
        entity.setBundleType(normalizedBundle);
        entity.setFileName(stored.fileName());
        entity.setObjectKey(stored.objectKey());
        entity.setContentType(stored.contentType());
        entity.setFileSize(stored.fileSize());
        entity.setSha256(stored.sha256());
        entity.setSignatureText(stored.signatureText());
        entity.setDownloadStatus(ARTIFACT_READY);
        DesktopReleaseArtifactEntity saved = artifactRepository.save(entity);
        if (oldObjectKey != null && !oldObjectKey.equals(stored.objectKey())) storageService.delete(oldObjectKey);
        return toArtifactSummary(saved);
    }

    /** 发布前确保 Windows x64 的 MSI、NSIS 安装器和 updater 签名矩阵完整。 */
    public DesktopReleaseDetail publish(Long id) {
        DesktopReleaseEntity release = requireRelease(id);
        requireStatus(release, STATUS_DRAFT);
        List<DesktopReleaseArtifactEntity> artifacts = artifactRepository.findAllByReleaseIdOrderByIdAsc(id);
        for (String bundle : List.of("msi", "nsis")) {
            requireArtifact(artifacts, ARTIFACT_INSTALLER, bundle);
            requireArtifact(artifacts, ARTIFACT_UPDATER, bundle);
            DesktopReleaseArtifactEntity signature = requireArtifact(artifacts, ARTIFACT_SIGNATURE, bundle);
            if (!StringUtils.hasText(signature.getSignatureText())) {
                throw new IllegalArgumentException("缺少 " + bundle + " updater 签名内容");
            }
        }
        release.setStatus(STATUS_PUBLISHED);
        release.setPublisherUserId(currentUserId());
        release.setPublishedAt(LocalDateTime.now());
        return toDetail(releaseRepository.save(release));
    }

    /** 撤回发布版本；撤回不删除对象，便于审计和后续人工核查。 */
    public DesktopReleaseDetail revoke(Long id) {
        DesktopReleaseEntity release = requireRelease(id);
        requireStatus(release, STATUS_PUBLISHED);
        release.setStatus(STATUS_REVOKED);
        return toDetail(releaseRepository.save(release));
    }

    /** 删除已撤回的发布记录并清理其产物，释放版本号以便重建同版本草稿。 */
    public void deleteRevoked(Long id) {
        DesktopReleaseEntity release = requireRelease(id);
        requireStatus(release, STATUS_REVOKED);
        for (DesktopReleaseArtifactEntity artifact : artifactRepository.findAllByReleaseIdOrderByIdAsc(id)) {
            try {
                storageService.delete(artifact.getObjectKey());
            } catch (RuntimeException ignored) {
                // 业务意图：清理 MinIO 产物是尽力而为，即使对象存储异常也不能阻塞释放版本号。
            }
        }
        artifactRepository.deleteAllByReleaseId(id);
        releaseRepository.delete(release);
    }

    /** 公开读取最新 stable 版本，供介绍页展示安装器和校验信息。 */
    @Transactional(Transactional.TxType.SUPPORTS)
    public Optional<DesktopReleaseLatest> latest(String channel, String platform, String arch) {
        String normalizedChannel = normalizeChannel(channel);
        String normalizedPlatform = normalizePlatform(platform);
        String normalizedArch = normalizeArch(arch);
        return latestPublished(normalizedChannel)
                .map(release -> new DesktopReleaseLatest(
                        release.getVersionCode(), release.getChannel(), release.getTitle(), release.getReleaseNotes(),
                        release.getPublishedAt(), artifactRepository.findAllByReleaseIdOrderByIdAsc(release.getId()).stream()
                                .filter(artifact -> ARTIFACT_INSTALLER.equals(artifact.getArtifactKind())
                                        && normalizedPlatform.equals(artifact.getPlatform())
                                        && normalizedArch.equals(artifact.getArch()))
                                .map(this::toArtifactSummary)
                                .toList()));
    }

    /** 按 Tauri 请求目标返回动态更新清单；无更新由控制器转换为 204。 */
    @Transactional(Transactional.TxType.SUPPORTS)
    public Optional<DesktopUpdateManifest> updateManifest(String platform,
                                                           String arch,
                                                           String bundleType,
                                                           String currentVersion) {
        String normalizedPlatform;
        String normalizedArch;
        String normalizedBundle;
        try {
            normalizedPlatform = normalizePlatform(platform);
            normalizedArch = normalizeArch(arch);
            normalizedBundle = normalizeBundleType(bundleType);
        } catch (IllegalArgumentException ignored) {
            // 业务意图：公开更新端点不能因未来平台参数而暴露 500，旧客户端应安全地视为暂无更新。
            return Optional.empty();
        }
        String normalizedCurrentVersion = normalizeVersion(currentVersion);
        if (!SEMVER.matcher(normalizedCurrentVersion).matches()) return Optional.empty();
        return latestPublished(CHANNEL_STABLE).flatMap(release -> {
            if (compareVersions(release.getVersionCode(), normalizedCurrentVersion) <= 0) return Optional.empty();
            DesktopReleaseArtifactEntity updater = findArtifact(release.getId(), ARTIFACT_UPDATER, normalizedPlatform, normalizedArch, normalizedBundle).orElse(null);
            DesktopReleaseArtifactEntity signature = findArtifact(release.getId(), ARTIFACT_SIGNATURE, normalizedPlatform, normalizedArch, normalizedBundle).orElse(null);
            if (updater == null || signature == null || !StringUtils.hasText(signature.getSignatureText())) return Optional.empty();
            return Optional.of(new DesktopUpdateManifest(
                    release.getVersionCode(), release.getReleaseNotes(),
                    release.getPublishedAt() == null ? null : release.getPublishedAt().toInstant(ZoneOffset.UTC).toString(),
                    buildDownloadUrl(updater.getId()), signature.getSignatureText()));
        });
    }

    /** 公开下载前重新校验版本状态，防止撤回版本继续发放新签名 URL。 */
    @Transactional(Transactional.TxType.SUPPORTS)
    public String publicDownloadUrl(Long artifactId) {
        DesktopReleaseArtifactEntity artifact = artifactRepository.findById(artifactId)
                .orElseThrow(() -> new NoSuchElementException("桌面发布产物不存在"));
        DesktopReleaseEntity release = requireRelease(artifact.getReleaseId());
        if (!STATUS_PUBLISHED.equals(release.getStatus())) throw new NoSuchElementException("桌面发布版本当前不可下载");
        if (ARTIFACT_SIGNATURE.equals(artifact.getArtifactKind())) throw new NoSuchElementException("签名文件不允许公开下载");
        if (!ARTIFACT_READY.equals(artifact.getDownloadStatus())) throw new NoSuchElementException("桌面发布产物当前不可下载");
        return storageService.presignedDownloadUrl(artifact.getObjectKey());
    }

    public DesktopReleaseEntity requireRelease(Long id) {
        return releaseRepository.findById(id).orElseThrow(() -> new NoSuchElementException("桌面版本不存在: " + id));
    }

    private Optional<DesktopReleaseEntity> latestPublished(String channel) {
        return releaseRepository.findAllByChannelAndStatusOrderByPublishedAtDescIdDesc(channel, STATUS_PUBLISHED).stream()
                .max(Comparator.comparing(DesktopReleaseEntity::getVersionCode, this::compareVersions)
                        .thenComparing(DesktopReleaseEntity::getPublishedAt, Comparator.nullsFirst(Comparator.naturalOrder())));
    }

    private DesktopReleaseArtifactEntity requireArtifact(List<DesktopReleaseArtifactEntity> artifacts, String kind, String bundleType) {
        return artifacts.stream().filter(artifact -> kind.equals(artifact.getArtifactKind())
                        && PLATFORM_WINDOWS.equals(artifact.getPlatform()) && ARCH_X86_64.equals(artifact.getArch())
                        && bundleType.equals(artifact.getBundleType()))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("缺少 " + bundleType + " 的 " + kind + " 产物"));
    }

    private Optional<DesktopReleaseArtifactEntity> findArtifact(Long releaseId, String kind, String platform, String arch, String bundleType) {
        return artifactRepository.findByReleaseIdAndArtifactKindAndPlatformAndArchAndBundleType(releaseId, kind, platform, arch, bundleType);
    }

    private DesktopReleaseDetail toDetail(DesktopReleaseEntity release) {
        return new DesktopReleaseDetail(release.getId(), release.getVersionCode(), release.getChannel(), release.getTitle(),
                release.getReleaseNotes(), release.getStatus(), release.getPublisherUserId(), release.getPublishedAt(),
                release.getCreatedAt(), artifactRepository.findAllByReleaseIdOrderByIdAsc(release.getId()).stream().map(this::toArtifactSummary).toList());
    }

    private DesktopReleaseArtifactSummary toArtifactSummary(DesktopReleaseArtifactEntity artifact) {
        return new DesktopReleaseArtifactSummary(artifact.getId(), artifact.getArtifactKind(), artifact.getPlatform(), artifact.getArch(),
                artifact.getBundleType(), artifact.getFileName(), artifact.getContentType(), artifact.getFileSize(), artifact.getSha256(), artifact.getDownloadStatus(), buildDownloadUrl(artifact.getId()));
    }

    private String buildDownloadUrl(Long artifactId) {
        try {
            return ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/api/desktop-releases/artifacts/{id}/download")
                    .buildAndExpand(artifactId).toUriString();
        } catch (IllegalStateException ignored) {
            return "/api/desktop-releases/artifacts/" + artifactId + "/download";
        }
    }

    private Long currentUserId() {
        return AuthContextHolder.get().map(context -> context.userId())
                .orElseThrow(() -> new IllegalStateException("当前用户信息缺失"));
    }

    private void requireStatus(DesktopReleaseEntity release, String status) {
        if (!status.equals(release.getStatus())) throw new IllegalStateException("桌面版本当前状态不允许该操作: " + release.getStatus());
    }

    private String normalizeChannel(String value) {
        String channel = normalize(value).toLowerCase(Locale.ROOT);
        if (channel.isBlank()) channel = CHANNEL_STABLE;
        if (!CHANNEL_STABLE.equals(channel)) throw new IllegalArgumentException("当前仅支持 stable 发布渠道");
        return channel;
    }

    private String normalizePlatform(String value) {
        String platform = normalize(value).toLowerCase(Locale.ROOT);
        if (!PLATFORM_WINDOWS.equals(platform)) throw new IllegalArgumentException("当前仅支持 Windows 桌面端");
        return platform;
    }

    private String normalizeArch(String value) {
        String arch = normalize(value).toLowerCase(Locale.ROOT);
        if (!ARCH_X86_64.equals(arch)) throw new IllegalArgumentException("当前仅支持 x86_64 桌面架构");
        return arch;
    }

    private String normalizeArtifactKind(String value) {
        String kind = normalize(value).toUpperCase(Locale.ROOT);
        if (!List.of(ARTIFACT_INSTALLER, ARTIFACT_UPDATER, ARTIFACT_SIGNATURE).contains(kind)) throw new IllegalArgumentException("不支持的桌面产物类型");
        return kind;
    }

    private String normalizeBundleType(String value) {
        String bundle = normalize(value).toLowerCase(Locale.ROOT);
        if (!List.of("msi", "nsis").contains(bundle)) throw new IllegalArgumentException("当前仅支持 msi 或 nsis updater 产物");
        return bundle;
    }

    private String normalizeVersion(String value) {
        return normalize(value).replaceFirst("^v", "");
    }

    private String normalize(String value) { return value == null ? "" : value.trim(); }

    private String normalizeContent(String value) { return value == null ? "" : value.replace("\r\n", "\n").replace('\r', '\n').trim(); }

    /** 仅比较 semver 的 core 和 prerelease，build metadata 不影响发布先后。 */
    private int compareVersions(String left, String right) {
        Version l = Version.parse(left);
        Version r = Version.parse(right);
        for (int i = 0; i < 3; i++) {
            int compared = Integer.compare(l.core[i], r.core[i]);
            if (compared != 0) return compared;
        }
        if (l.prerelease.isBlank() && !r.prerelease.isBlank()) return 1;
        if (!l.prerelease.isBlank() && r.prerelease.isBlank()) return -1;
        return l.prerelease.compareTo(r.prerelease);
    }

    private record Version(int[] core, String prerelease) {
        static Version parse(String value) {
            String normalized = value == null ? "0.0.0" : value.trim().replaceFirst("^v", "");
            String withoutBuild = normalized.split("\\+", 2)[0];
            String[] parts = withoutBuild.split("-", 2);
            String[] coreParts = parts[0].split("\\.");
            int[] core = new int[3];
            for (int i = 0; i < core.length && i < coreParts.length; i++) {
                try { core[i] = Integer.parseInt(coreParts[i]); } catch (NumberFormatException ignored) { core[i] = 0; }
            }
            return new Version(core, parts.length > 1 ? parts[1] : "");
        }
    }
}
