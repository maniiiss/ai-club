package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformReleaseEntity;
import com.aiclub.platform.domain.model.PlatformReleaseViewEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PlatformReleaseAcknowledgeResult;
import com.aiclub.platform.dto.PlatformReleaseDetail;
import com.aiclub.platform.dto.PlatformReleaseSummary;
import com.aiclub.platform.dto.request.PlatformReleaseRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.PlatformReleaseRepository;
import com.aiclub.platform.repository.PlatformReleaseViewRepository;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.NoSuchElementException;

/**
 * 平台版本发布业务服务。
 * 业务意图：将管理员发布、公众端待展示查询和用户展示确认统一在独立领域内处理。
 */
@Service
@Transactional(readOnly = true)
public class PlatformReleaseService {

    private final PlatformReleaseRepository releaseRepository;
    private final PlatformReleaseViewRepository viewRepository;

    public PlatformReleaseService(PlatformReleaseRepository releaseRepository,
                                  PlatformReleaseViewRepository viewRepository) {
        this.releaseRepository = releaseRepository;
        this.viewRepository = viewRepository;
    }

    /** 发布一个不可编辑的新版本。 */
    @Transactional
    public PlatformReleaseDetail publish(PlatformReleaseRequest request) {
        String version = normalize(request.version());
        if (releaseRepository.existsByVersionCodeIgnoreCase(version)) {
            throw new IllegalArgumentException("版本号已发布: " + version);
        }
        PlatformReleaseEntity entity = new PlatformReleaseEntity();
        entity.setVersionCode(version);
        entity.setTitle(normalize(request.title()));
        entity.setContent(normalizeContent(request.content()));
        entity.setPublisherUserId(requireCurrentUserId());
        return toDetail(releaseRepository.save(entity));
    }

    /** 分页查询管理端版本历史，最新发布版本排在最前。 */
    public PageResponse<PlatformReleaseSummary> pageAdmin(int page, int size) {
        PageRequest pageable = PageRequest.of(
                Math.max(page, 1) - 1,
                Math.max(1, Math.min(size, 50)),
                Sort.by(Sort.Direction.DESC, "publishedAt", "id")
        );
        Page<PlatformReleaseSummary> result = releaseRepository.findAll(pageable).map(this::toSummary);
        return PageResponse.from(result);
    }

    /** 读取管理端单条版本的完整 Markdown 内容。 */
    public PlatformReleaseDetail getAdmin(Long releaseId) {
        return releaseRepository.findById(releaseId)
                .map(this::toDetail)
                .orElseThrow(() -> new NoSuchElementException("版本发布不存在: " + releaseId));
    }

    /** 获取当前用户尚未展示的最新版本；没有待展示内容时返回空。 */
    public Optional<PlatformReleaseDetail> pendingForCurrentUser() {
        Long userId = requireCurrentUserId();
        return releaseRepository.findFirstByOrderByPublishedAtDescIdDesc()
                .filter(release -> !viewRepository.existsByReleaseIdAndUserId(release.getId(), userId))
                .map(this::toDetail);
    }

    /** 记录用户已展示版本，重复调用保持幂等。 */
    @Transactional
    public PlatformReleaseAcknowledgeResult acknowledge(Long releaseId) {
        Long userId = requireCurrentUserId();
        PlatformReleaseEntity release = releaseRepository.findById(releaseId)
                .orElseThrow(() -> new java.util.NoSuchElementException("版本发布不存在: " + releaseId));
        if (!viewRepository.existsByReleaseIdAndUserId(release.getId(), userId)) {
            PlatformReleaseViewEntity view = new PlatformReleaseViewEntity();
            view.setReleaseId(release.getId());
            view.setUserId(userId);
            view.setViewedAt(LocalDateTime.now());
            viewRepository.save(view);
        }
        return new PlatformReleaseAcknowledgeResult(release.getId(), true);
    }

    private PlatformReleaseSummary toSummary(PlatformReleaseEntity entity) {
        return new PlatformReleaseSummary(entity.getId(), entity.getVersionCode(), entity.getTitle(),
                entity.getPublisherUserId(), entity.getPublishedAt());
    }

    private PlatformReleaseDetail toDetail(PlatformReleaseEntity entity) {
        return new PlatformReleaseDetail(entity.getId(), entity.getVersionCode(), entity.getTitle(),
                entity.getContent(), entity.getPublisherUserId(), entity.getPublishedAt());
    }

    private Long requireCurrentUserId() {
        return AuthContextHolder.get()
                .map(context -> context.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeContent(String value) {
        return value == null ? "" : value.replace("\r\n", "\n").replace('\r', '\n').trim();
    }
}
