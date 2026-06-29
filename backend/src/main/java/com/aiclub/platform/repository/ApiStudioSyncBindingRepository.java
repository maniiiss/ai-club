package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioSyncBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 原生 API 工作台 - 同步来源绑定仓储。
 */
public interface ApiStudioSyncBindingRepository extends JpaRepository<ApiStudioSyncBindingEntity, Long> {

    List<ApiStudioSyncBindingEntity> findBySourceTypeAndSourceBindingIdAndBranch(String sourceType,
                                                                                Long sourceBindingId,
                                                                                String branch);

    List<ApiStudioSyncBindingEntity> findBySourceTypeAndSourceBindingId(String sourceType, Long sourceBindingId);

    Optional<ApiStudioSyncBindingEntity> findByEndpointId(Long endpointId);

    void deleteByEndpointId(Long endpointId);
}
