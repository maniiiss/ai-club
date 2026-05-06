package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectApiProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProjectApiProfileRepository extends JpaRepository<ProjectApiProfileEntity, Long> {

    Optional<ProjectApiProfileEntity> findByProject_Id(Long projectId);

    Optional<ProjectApiProfileEntity> findByProjectIsNull();
}
