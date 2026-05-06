package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectApiEndpointEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectApiEndpointRepository extends JpaRepository<ProjectApiEndpointEntity, Long> {

    List<ProjectApiEndpointEntity> findByProject_IdOrderByIdAsc(Long projectId);

    Optional<ProjectApiEndpointEntity> findByProject_IdAndId(Long projectId, Long id);

    List<ProjectApiEndpointEntity> findByProjectIsNullOrderByIdAsc();

    Optional<ProjectApiEndpointEntity> findByProjectIsNullAndId(Long id);
}
