package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskWorkItemRelationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskWorkItemRelationRepository extends JpaRepository<TaskWorkItemRelationEntity, Long> {

    boolean existsBySourceTask_IdAndTargetTask_IdAndRelationType(Long sourceTaskId, Long targetTaskId, String relationType);

    Optional<TaskWorkItemRelationEntity> findBySourceTask_IdAndTargetTask_IdAndRelationType(Long sourceTaskId, Long targetTaskId, String relationType);

    List<TaskWorkItemRelationEntity> findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(Long sourceTaskId, String relationType);

    List<TaskWorkItemRelationEntity> findAllByTargetTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(Long targetTaskId, String relationType);

    List<TaskWorkItemRelationEntity> findAllByRelationTypeAndSourceTask_IdOrRelationTypeAndTargetTask_IdOrderByCreatedAtAscIdAsc(
            String sourceRelationType,
            Long sourceTaskId,
            String targetRelationType,
            Long targetTaskId
    );
}
