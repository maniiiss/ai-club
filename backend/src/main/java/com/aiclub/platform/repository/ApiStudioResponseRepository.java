package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioResponseEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 原生 API 工作台 - 响应定义仓储。
 */
public interface ApiStudioResponseRepository extends JpaRepository<ApiStudioResponseEntity, Long> {

    List<ApiStudioResponseEntity> findByEndpointIdOrderBySortOrderAscIdAsc(Long endpointId);

    void deleteByEndpointId(Long endpointId);
}
