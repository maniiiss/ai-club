package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectApiFolderEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectApiFolderRepository extends JpaRepository<ProjectApiFolderEntity, Long> {

    List<ProjectApiFolderEntity> findByProject_IdOrderBySortOrderAscIdAsc(Long projectId);

    Optional<ProjectApiFolderEntity> findByProject_IdAndId(Long projectId, Long id);

    List<ProjectApiFolderEntity> findByProjectIsNullOrderBySortOrderAscIdAsc();

    Optional<ProjectApiFolderEntity> findByProjectIsNullAndId(Long id);
}
