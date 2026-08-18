package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DesktopReleaseArtifactEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** GitPilot Desktop 发布产物仓储。 */
public interface DesktopReleaseArtifactRepository extends JpaRepository<DesktopReleaseArtifactEntity, Long> {

    List<DesktopReleaseArtifactEntity> findAllByReleaseIdOrderByIdAsc(Long releaseId);

    Optional<DesktopReleaseArtifactEntity> findByReleaseIdAndArtifactKindAndPlatformAndArchAndBundleType(
            Long releaseId, String artifactKind, String platform, String arch, String bundleType);
}
