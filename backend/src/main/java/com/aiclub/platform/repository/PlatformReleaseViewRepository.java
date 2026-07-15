package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformReleaseViewEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/** 用户版本发布展示状态仓储。 */
public interface PlatformReleaseViewRepository extends JpaRepository<PlatformReleaseViewEntity, Long> {

    /** 判断指定用户是否已经展示过某个版本。 */
    boolean existsByReleaseIdAndUserId(Long releaseId, Long userId);
}
