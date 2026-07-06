package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskTestCaseRelationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskTestCaseRelationRepository extends JpaRepository<TaskTestCaseRelationEntity, Long> {

    boolean existsByTask_IdAndTestCase_Id(Long taskId, Long testCaseId);

    Optional<TaskTestCaseRelationEntity> findByTask_IdAndTestCase_Id(Long taskId, Long testCaseId);

    List<TaskTestCaseRelationEntity> findAllByTask_IdOrderByCreatedAtAscIdAsc(Long taskId);
}
