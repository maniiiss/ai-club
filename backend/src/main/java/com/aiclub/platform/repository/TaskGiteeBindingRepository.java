package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskGiteeBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TaskGiteeBindingRepository extends JpaRepository<TaskGiteeBindingEntity, Long> {

    Optional<TaskGiteeBindingEntity> findByTask_Id(Long taskId);

    Optional<TaskGiteeBindingEntity> findByEnterpriseIdAndGiteeIssueId(Long enterpriseId, Long giteeIssueId);

    List<TaskGiteeBindingEntity> findAllByEnterpriseIdAndGiteeIssueIdIn(Long enterpriseId, Collection<Long> giteeIssueIds);

    List<TaskGiteeBindingEntity> findAllByIteration_IdOrderByIdAsc(Long iterationId);
}
