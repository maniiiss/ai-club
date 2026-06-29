package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioDebugRecordEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 原生 API 工作台 - 调试记录仓储。
 */
public interface ApiStudioDebugRecordRepository extends JpaRepository<ApiStudioDebugRecordEntity, Long> {

    Page<ApiStudioDebugRecordEntity> findByProjectIdAndCreatorUserIdOrderByCreatedAtDesc(Long projectId, Long creatorUserId, Pageable pageable);

    Page<ApiStudioDebugRecordEntity> findByProjectIdAndCreatorUserIdAndEndpointIdOrderByCreatedAtDesc(Long projectId, Long creatorUserId, Long endpointId, Pageable pageable);
}
