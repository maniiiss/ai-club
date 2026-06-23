package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioEndpointVersionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 原生 API 工作台 - API 版本快照仓储。
 */
public interface ApiStudioEndpointVersionRepository extends JpaRepository<ApiStudioEndpointVersionEntity, Long> {

    List<ApiStudioEndpointVersionEntity> findByEndpointIdOrderByVersionNoDesc(Long endpointId);

    Optional<ApiStudioEndpointVersionEntity> findFirstByEndpointIdOrderByVersionNoDesc(Long endpointId);
}
