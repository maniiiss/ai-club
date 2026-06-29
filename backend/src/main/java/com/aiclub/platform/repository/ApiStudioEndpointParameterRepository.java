package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioEndpointParameterEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 原生 API 工作台 - API 参数仓储。
 */
public interface ApiStudioEndpointParameterRepository extends JpaRepository<ApiStudioEndpointParameterEntity, Long> {

    List<ApiStudioEndpointParameterEntity> findByEndpointIdOrderByLocationAscSortOrderAscIdAsc(Long endpointId);

    void deleteByEndpointId(Long endpointId);
}
