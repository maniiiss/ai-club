package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface TaskRepository extends JpaRepository<TaskEntity, Long>, JpaSpecificationExecutor<TaskEntity> {

    boolean existsByWorkItemCode(String workItemCode);

    long countByProject_Id(Long projectId);

    long countByProject_IdAndIteration_Id(Long projectId, Long iterationId);

    long countByProject_IdAndIterationIsNull(Long projectId);

    List<TaskEntity> findAllByOrderByIdDesc();

    List<TaskEntity> findAllByAgent_Id(Long agentId);

    List<TaskEntity> findAllByIteration_Id(Long iterationId);

    List<TaskEntity> findAllByProject_IdOrderByUpdatedAtAscIdAsc(Long projectId);
}
