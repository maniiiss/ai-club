package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.IterationGiteeBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface IterationGiteeBindingRepository extends JpaRepository<IterationGiteeBindingEntity, Long> {

    Optional<IterationGiteeBindingEntity> findByIteration_Id(Long iterationId);

    boolean existsByProject_IdAndGiteeMilestoneIdAndIdNot(Long projectId, Long giteeMilestoneId, Long id);
}
