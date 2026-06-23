package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioEnvironmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 原生 API 工作台 - 环境仓储。
 */
public interface ApiStudioEnvironmentRepository extends JpaRepository<ApiStudioEnvironmentEntity, Long> {

    List<ApiStudioEnvironmentEntity> findByProjectIdOrderByIsDefaultDescIdAsc(Long projectId);

    Optional<ApiStudioEnvironmentEntity> findFirstByProjectIdAndIsDefaultTrue(Long projectId);

    List<ApiStudioEnvironmentEntity> findByProjectIdAndIsDefaultTrue(Long projectId);
}
