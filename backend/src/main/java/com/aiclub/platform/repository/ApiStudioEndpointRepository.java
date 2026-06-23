package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioEndpointEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 原生 API 工作台 - API 端点仓储。
 */
public interface ApiStudioEndpointRepository extends JpaRepository<ApiStudioEndpointEntity, Long> {

    List<ApiStudioEndpointEntity> findByProjectIdOrderBySortOrderAscIdAsc(Long projectId);

    List<ApiStudioEndpointEntity> findByProjectIdAndDirectoryIdOrderBySortOrderAscIdAsc(Long projectId, Long directoryId);

    List<ApiStudioEndpointEntity> findByDirectoryId(Long directoryId);

    long countByDirectoryId(Long directoryId);

    List<ApiStudioEndpointEntity> findByProjectIdAndMethodAndPathAndStatus(Long projectId, String method, String path, String status);
}
