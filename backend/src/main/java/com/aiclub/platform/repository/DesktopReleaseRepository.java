package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DesktopReleaseEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** GitPilot Desktop 版本发布仓储。 */
public interface DesktopReleaseRepository extends JpaRepository<DesktopReleaseEntity, Long> {

    boolean existsByVersionCodeIgnoreCaseAndChannel(String versionCode, String channel);

    Page<DesktopReleaseEntity> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    List<DesktopReleaseEntity> findAllByChannelAndStatusOrderByPublishedAtDescIdDesc(String channel, String status);

    Optional<DesktopReleaseEntity> findByIdAndStatus(Long id, String status);
}
