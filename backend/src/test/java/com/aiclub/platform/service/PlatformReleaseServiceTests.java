package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformReleaseEntity;
import com.aiclub.platform.dto.PlatformReleaseAcknowledgeResult;
import com.aiclub.platform.dto.PlatformReleaseDetail;
import com.aiclub.platform.dto.request.PlatformReleaseRequest;
import com.aiclub.platform.domain.model.PlatformReleaseViewEntity;
import com.aiclub.platform.repository.PlatformReleaseRepository;
import com.aiclub.platform.repository.PlatformReleaseViewRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖版本发布的发布、待展示和确认状态规则。
 * 业务意图：确保版本内容只发布一次，用户关闭或确认后状态可幂等落库。
 */
@ExtendWith(MockitoExtension.class)
class PlatformReleaseServiceTests {

    @Mock
    private PlatformReleaseRepository releaseRepository;

    @Mock
    private PlatformReleaseViewRepository viewRepository;

    private PlatformReleaseService platformReleaseService;

    @BeforeEach
    void setUp() {
        platformReleaseService = new PlatformReleaseService(releaseRepository, viewRepository);
        AuthContextHolder.set(new AuthContext(7L, "release-admin", "版本管理员", Set.of("SUPER_ADMIN"), Set.of("system:release:manage")));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldPublishTrimmedMarkdownRelease() {
        when(releaseRepository.existsByVersionCodeIgnoreCase("1.4.0")).thenReturn(false);
        when(releaseRepository.save(any(PlatformReleaseEntity.class))).thenAnswer(invocation -> {
            PlatformReleaseEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            entity.setPublishedAt(LocalDateTime.of(2026, 7, 15, 14, 0));
            return entity;
        });

        PlatformReleaseDetail detail = platformReleaseService.publish(new PlatformReleaseRequest(
                " 1.4.0 ", " 公众端升级 ", "## 新功能\r\n\r\n- 发布提示 "
        ));

        assertThat(detail.id()).isEqualTo(11L);
        assertThat(detail.version()).isEqualTo("1.4.0");
        assertThat(detail.title()).isEqualTo("公众端升级");
        assertThat(detail.content()).isEqualTo("## 新功能\n\n- 发布提示");
        assertThat(detail.publisherUserId()).isEqualTo(7L);
    }

    @Test
    void shouldRejectDuplicateVersion() {
        when(releaseRepository.existsByVersionCodeIgnoreCase("1.4.0")).thenReturn(true);

        assertThatThrownBy(() -> platformReleaseService.publish(new PlatformReleaseRequest(
                "1.4.0", "重复版本", "内容"
        ))).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("版本号已发布");

        verify(releaseRepository, never()).save(any(PlatformReleaseEntity.class));
    }

    @Test
    void shouldReturnLatestReleaseWhenCurrentUserHasNotViewedIt() {
        PlatformReleaseEntity release = release(12L, "1.5.0");
        when(releaseRepository.findFirstByOrderByPublishedAtDescIdDesc()).thenReturn(Optional.of(release));
        when(viewRepository.existsByReleaseIdAndUserId(12L, 7L)).thenReturn(false);

        assertThat(platformReleaseService.pendingForCurrentUser())
                .get()
                .extracting(PlatformReleaseDetail::version)
                .isEqualTo("1.5.0");
    }

    @Test
    void shouldHideReleaseAfterItWasViewed() {
        PlatformReleaseEntity release = release(12L, "1.5.0");
        when(releaseRepository.findFirstByOrderByPublishedAtDescIdDesc()).thenReturn(Optional.of(release));
        when(viewRepository.existsByReleaseIdAndUserId(12L, 7L)).thenReturn(true);

        assertThat(platformReleaseService.pendingForCurrentUser()).isEmpty();
    }

    @Test
    void shouldAcknowledgeReleaseIdempotently() {
        PlatformReleaseEntity release = release(12L, "1.5.0");
        when(releaseRepository.findById(12L)).thenReturn(Optional.of(release));
        when(viewRepository.existsByReleaseIdAndUserId(12L, 7L)).thenReturn(false, true);

        PlatformReleaseAcknowledgeResult first = platformReleaseService.acknowledge(12L);
        PlatformReleaseAcknowledgeResult second = platformReleaseService.acknowledge(12L);

        assertThat(first).isEqualTo(new PlatformReleaseAcknowledgeResult(12L, true));
        assertThat(second).isEqualTo(new PlatformReleaseAcknowledgeResult(12L, true));
        ArgumentCaptor<PlatformReleaseViewEntity> captor = ArgumentCaptor.forClass(PlatformReleaseViewEntity.class);
        verify(viewRepository).save(captor.capture());
        assertThat(captor.getValue().getReleaseId()).isEqualTo(12L);
        assertThat(captor.getValue().getUserId()).isEqualTo(7L);
    }

    private PlatformReleaseEntity release(Long id, String version) {
        PlatformReleaseEntity entity = new PlatformReleaseEntity();
        entity.setId(id);
        entity.setVersionCode(version);
        entity.setTitle("发布标题");
        entity.setContent("发布内容");
        entity.setPublisherUserId(7L);
        entity.setPublishedAt(LocalDateTime.of(2026, 7, 15, 14, 0));
        return entity;
    }
}
