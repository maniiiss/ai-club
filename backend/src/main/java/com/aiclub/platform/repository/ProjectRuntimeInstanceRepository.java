package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectRuntimeInstanceRepository extends JpaRepository<ProjectRuntimeInstanceEntity, Long> {

    List<ProjectRuntimeInstanceEntity> findAllByProject_IdOrderByIdAsc(Long projectId);

    Optional<ProjectRuntimeInstanceEntity> findByIdAndProject_Id(Long id, Long projectId);

    List<ProjectRuntimeInstanceEntity> findAllBySourceTypeAndSourceBindingIdOrderByIdAsc(String sourceType, Long sourceBindingId);

    void deleteAllBySourceTypeAndSourceBindingId(String sourceType, Long sourceBindingId);
}
