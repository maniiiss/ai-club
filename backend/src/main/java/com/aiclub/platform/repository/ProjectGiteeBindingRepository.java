package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProjectGiteeBindingRepository extends JpaRepository<ProjectGiteeBindingEntity, Long> {

    Optional<ProjectGiteeBindingEntity> findByProject_Id(Long projectId);

    boolean existsByProject_IdAndIdNot(Long projectId, Long id);
}
