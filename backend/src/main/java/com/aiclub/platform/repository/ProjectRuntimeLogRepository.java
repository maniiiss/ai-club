package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectRuntimeLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ProjectRuntimeLogRepository extends JpaRepository<ProjectRuntimeLogEntity, Long>, JpaSpecificationExecutor<ProjectRuntimeLogEntity> {

    void deleteAllByLoggedAtBefore(java.time.LocalDateTime cutoff);
}
