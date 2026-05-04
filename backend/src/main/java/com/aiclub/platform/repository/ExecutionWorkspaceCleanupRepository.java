package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExecutionWorkspaceCleanupRepository extends JpaRepository<ExecutionWorkspaceCleanupEntity, Long> {

    Optional<ExecutionWorkspaceCleanupEntity> findByExecutionRunIdAndWorkspaceRoot(Long executionRunId, String workspaceRoot);

    List<ExecutionWorkspaceCleanupEntity> findAllByExecutionRunIdAndStatusOrderByIdAsc(Long executionRunId, String status);
}
