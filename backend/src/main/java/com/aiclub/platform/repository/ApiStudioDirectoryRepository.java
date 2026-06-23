package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioDirectoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 原生 API 工作台 - 目录仓储。
 */
public interface ApiStudioDirectoryRepository extends JpaRepository<ApiStudioDirectoryEntity, Long> {

    List<ApiStudioDirectoryEntity> findByProjectIdOrderByParentIdAscSortOrderAscIdAsc(Long projectId);

    List<ApiStudioDirectoryEntity> findByProjectIdAndParentIdOrderBySortOrderAscIdAsc(Long projectId, Long parentId);

    long countByParentId(Long parentId);
}
