package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExecutionRunRepository extends JpaRepository<ExecutionRunEntity, Long> {

    long countByExecutionTask_Id(Long executionTaskId);

    List<ExecutionRunEntity> findAllByExecutionTask_IdOrderByRunNoDescIdDesc(Long executionTaskId);

    List<ExecutionRunEntity> findTop10ByExecutionTask_WorkItem_IdOrderByCreatedAtDescIdDesc(Long workItemId);
}
