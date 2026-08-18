package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DesktopReleaseArtifactEntity;
import com.aiclub.platform.domain.model.DesktopReleaseEntity;
import com.aiclub.platform.dto.DesktopReleaseDetail;
import com.aiclub.platform.dto.DesktopUpdateManifest;
import com.aiclub.platform.dto.request.DesktopReleaseRequest;
import com.aiclub.platform.repository.DesktopReleaseArtifactRepository;
import com.aiclub.platform.repository.DesktopReleaseRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖桌面发布的核心生命周期和公开更新选择规则。
 * 业务意图：发布域的错误不能污染现有平台版本说明，也不能向客户端发放草稿或撤回产物。
 */
@ExtendWith(MockitoExtension.class)
class DesktopReleaseServiceTests {

    @Mock
    private DesktopReleaseRepository releaseRepository;
    @Mock
    private DesktopReleaseArtifactRepository artifactRepository;
    @Mock
    private DesktopReleaseStorageService storageService;

    private DesktopReleaseService service;

    @BeforeEach
    void setUp() {
        service = new DesktopReleaseService(releaseRepository, artifactRepository, storageService);
        AuthContextHolder.set(new AuthContext(7L, "release-admin", "版本管理员", Set.of("SUPER_ADMIN"), Set.of("system:desktop-release:manage")));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldCreateNormalizedDraft() {
        when(releaseRepository.existsByVersionCodeIgnoreCaseAndChannel("1.2.0", "stable")).thenReturn(false);
        when(releaseRepository.save(any(DesktopReleaseEntity.class))).thenAnswer(invocation -> {
            DesktopReleaseEntity release = invocation.getArgument(0);
            release.setId(12L);
            release.setCreatedAt(LocalDateTime.of(2026, 8, 18, 10, 0));
            release.setUpdatedAt(release.getCreatedAt());
            return release;
        });
        when(artifactRepository.findAllByReleaseIdOrderByIdAsc(12L)).thenReturn(List.of());

        DesktopReleaseDetail detail = service.createDraft(new DesktopReleaseRequest(
                " v1.2.0 ", " Windows stable ", "## 修复\r\n\r\n- 更新", "stable"));

        assertThat(detail.version()).isEqualTo("1.2.0");
        assertThat(detail.title()).isEqualTo("Windows stable");
        assertThat(detail.releaseNotes()).isEqualTo("## 修复\n\n- 更新");
        assertThat(detail.status()).isEqualTo(DesktopReleaseService.STATUS_DRAFT);
    }

    @Test
    void shouldRejectDuplicateChannelVersion() {
        when(releaseRepository.existsByVersionCodeIgnoreCaseAndChannel("1.2.0", "stable")).thenReturn(true);

        assertThatThrownBy(() -> service.createDraft(new DesktopReleaseRequest("1.2.0", "重复", "", "stable")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("版本号已存在");
        verify(releaseRepository, never()).save(any(DesktopReleaseEntity.class));
    }

    @Test
    void shouldRejectPublishWhenArtifactMatrixIsIncomplete() {
        DesktopReleaseEntity release = release(12L, "1.2.0", DesktopReleaseService.STATUS_DRAFT);
        when(releaseRepository.findById(12L)).thenReturn(Optional.of(release));
        when(artifactRepository.findAllByReleaseIdOrderByIdAsc(12L)).thenReturn(List.of(installer(1L, "msi")));

        assertThatThrownBy(() -> service.publish(12L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缺少 msi 的 UPDATER 产物");
        verify(releaseRepository, never()).save(any(DesktopReleaseEntity.class));
    }

    @Test
    void shouldReturnSignedManifestForOlderVersion() {
        DesktopReleaseEntity release = release(12L, "1.2.0", DesktopReleaseService.STATUS_PUBLISHED);
        release.setPublishedAt(LocalDateTime.of(2026, 8, 18, 10, 0));
        DesktopReleaseArtifactEntity updater = artifact(21L, DesktopReleaseService.ARTIFACT_UPDATER, "nsis");
        updater.setObjectKey("desktop-releases/12/updater.zip");
        DesktopReleaseArtifactEntity signature = artifact(22L, DesktopReleaseService.ARTIFACT_SIGNATURE, "nsis");
        signature.setSignatureText("signed-content");
        when(releaseRepository.findAllByChannelAndStatusOrderByPublishedAtDescIdDesc("stable", "PUBLISHED"))
                .thenReturn(List.of(release));
        when(artifactRepository.findByReleaseIdAndArtifactKindAndPlatformAndArchAndBundleType(12L, "UPDATER", "windows", "x86_64", "nsis"))
                .thenReturn(Optional.of(updater));
        when(artifactRepository.findByReleaseIdAndArtifactKindAndPlatformAndArchAndBundleType(12L, "SIGNATURE", "windows", "x86_64", "nsis"))
                .thenReturn(Optional.of(signature));

        Optional<DesktopUpdateManifest> result = service.updateManifest("windows", "x86_64", "nsis", "1.1.0");

        assertThat(result).isPresent();
        assertThat(result.get().version()).isEqualTo("1.2.0");
        assertThat(result.get().signature()).isEqualTo("signed-content");
        assertThat(result.get().url()).contains("/api/desktop-releases/artifacts/21/download");
    }

    @Test
    void shouldReturnEmptyForNoUpdateOrUnsupportedTarget() {
        DesktopReleaseEntity release = release(12L, "1.2.0", DesktopReleaseService.STATUS_PUBLISHED);
        when(releaseRepository.findAllByChannelAndStatusOrderByPublishedAtDescIdDesc("stable", "PUBLISHED"))
                .thenReturn(List.of(release));

        assertThat(service.updateManifest("windows", "x86_64", "nsis", "1.2.0")).isEmpty();
        assertThat(service.updateManifest("linux", "x86_64", "nsis", "1.0.0")).isEmpty();
    }

    @Test
    void shouldRefuseDownloadForRevokedRelease() {
        DesktopReleaseArtifactEntity artifact = artifact(21L, DesktopReleaseService.ARTIFACT_INSTALLER, "nsis");
        artifact.setObjectKey("private/object");
        when(artifactRepository.findById(21L)).thenReturn(Optional.of(artifact));
        when(releaseRepository.findById(12L)).thenReturn(Optional.of(release(12L, "1.2.0", DesktopReleaseService.STATUS_REVOKED)));

        assertThatThrownBy(() -> service.publicDownloadUrl(21L))
                .isInstanceOf(java.util.NoSuchElementException.class)
                .hasMessageContaining("不可下载");
        verify(storageService, never()).presignedDownloadUrl(any());
    }

    private DesktopReleaseEntity release(Long id, String version, String status) {
        DesktopReleaseEntity release = new DesktopReleaseEntity();
        release.setId(id);
        release.setVersionCode(version);
        release.setChannel("stable");
        release.setTitle("桌面版本");
        release.setReleaseNotes("更新说明");
        release.setStatus(status);
        release.setPublisherUserId(7L);
        release.setCreatedAt(LocalDateTime.of(2026, 8, 18, 9, 0));
        return release;
    }

    private DesktopReleaseArtifactEntity artifact(Long id, String kind, String bundle) {
        DesktopReleaseArtifactEntity artifact = new DesktopReleaseArtifactEntity();
        artifact.setId(id);
        artifact.setReleaseId(12L);
        artifact.setArtifactKind(kind);
        artifact.setPlatform("windows");
        artifact.setArch("x86_64");
        artifact.setBundleType(bundle);
        artifact.setFileName(kind.toLowerCase() + "." + bundle);
        artifact.setFileSize(1024);
        artifact.setSha256("a".repeat(64));
        artifact.setDownloadStatus(DesktopReleaseService.ARTIFACT_READY);
        return artifact;
    }

    private DesktopReleaseArtifactEntity installer(Long id, String bundle) {
        return artifact(id, DesktopReleaseService.ARTIFACT_INSTALLER, bundle);
    }
}
