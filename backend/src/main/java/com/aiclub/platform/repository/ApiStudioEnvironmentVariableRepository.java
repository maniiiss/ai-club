package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioEnvironmentVariableEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 原生 API 工作台 - 环境变量仓储。
 */
public interface ApiStudioEnvironmentVariableRepository extends JpaRepository<ApiStudioEnvironmentVariableEntity, Long> {

    List<ApiStudioEnvironmentVariableEntity> findByEnvironmentIdOrderByIdAsc(Long environmentId);

    void deleteByEnvironmentId(Long environmentId);
}
