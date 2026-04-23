package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiSpaceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Wiki 空间仓储。
 */
public interface WikiSpaceRepository extends JpaRepository<WikiSpaceEntity, Long> {

    /**
     * 读取直接绑定到指定项目的空间。
     */
    List<WikiSpaceEntity> findAllByBoundProject_IdOrderByIdAsc(Long projectId);
}
