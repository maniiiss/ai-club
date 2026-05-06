package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectApiEnvironmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectApiEnvironmentRepository extends JpaRepository<ProjectApiEnvironmentEntity, Long> {

    List<ProjectApiEnvironmentEntity> findByProject_IdOrderByIsDefaultDescIdAsc(Long projectId);

    Optional<ProjectApiEnvironmentEntity> findByProject_IdAndId(Long projectId, Long id);

    List<ProjectApiEnvironmentEntity> findByProjectIsNullOrderByIsDefaultDescIdAsc();

    Optional<ProjectApiEnvironmentEntity> findByProjectIsNullAndId(Long id);
}
