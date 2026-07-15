package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformReleaseEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/** 平台版本发布记录仓储。 */
public interface PlatformReleaseRepository extends JpaRepository<PlatformReleaseEntity, Long> {

    /** 版本号唯一校验，忽略大小写避免重复发布。 */
    boolean existsByVersionCodeIgnoreCase(String versionCode);

    /** 读取最新正式发布版本。 */
    Optional<PlatformReleaseEntity> findFirstByOrderByPublishedAtDescIdDesc();
}
