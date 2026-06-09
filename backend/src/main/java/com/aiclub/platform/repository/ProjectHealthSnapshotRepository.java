package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectHealthSnapshotEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ProjectHealthSnapshotRepository extends JpaRepository<ProjectHealthSnapshotEntity, Long> {

    List<ProjectHealthSnapshotEntity> findTop200ByProject_IdOrderBySampledAtDescIdDesc(Long projectId);

    List<ProjectHealthSnapshotEntity> findTop200ByProject_IdAndRuntimeInstance_IdOrderBySampledAtDescIdDesc(Long projectId, Long runtimeInstanceId);

    void deleteAllBySampledAtBefore(LocalDateTime cutoff);
}
