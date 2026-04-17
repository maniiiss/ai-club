package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiSpaceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Wiki 空间仓储。
 */
public interface WikiSpaceRepository extends JpaRepository<WikiSpaceEntity, Long> {
}
