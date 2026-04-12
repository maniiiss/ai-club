package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface ExecutionTaskRepository extends JpaRepository<ExecutionTaskEntity, Long>, JpaSpecificationExecutor<ExecutionTaskEntity> {

    List<ExecutionTaskEntity> findTop10ByStatusOrderByCreatedAtAscIdAsc(String status);
}
