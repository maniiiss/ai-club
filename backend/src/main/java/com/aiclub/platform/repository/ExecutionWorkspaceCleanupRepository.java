package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ExecutionWorkspaceCleanupRepository extends JpaRepository<ExecutionWorkspaceCleanupEntity, Long> {

    Optional<ExecutionWorkspaceCleanupEntity> findByExecutionRunIdAndWorkspaceRoot(Long executionRunId, String workspaceRoot);

    List<ExecutionWorkspaceCleanupEntity> findAllByExecutionRunIdAndStatusOrderByIdAsc(Long executionRunId, String status);

    List<ExecutionWorkspaceCleanupEntity> findAllByExecutionTaskId(Long executionTaskId);

    List<ExecutionWorkspaceCleanupEntity> findAllByStatusAndExpiresAtLessThanEqualOrderByExpiresAtAscIdAsc(
            String status,
            LocalDateTime expiresAt,
            Pageable pageable
    );

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE ExecutionWorkspaceCleanupEntity entity
               SET entity.status = :deletedStatus,
                   entity.deletedAt = :deletedAt,
                   entity.updatedAt = CURRENT_TIMESTAMP,
                   entity.deleteFailedAt = NULL,
                   entity.deleteErrorMessage = NULL
             WHERE entity.id = :recordId
               AND entity.status = :scheduledStatus
            """)
    int markDeletedIfScheduled(@Param("recordId") Long recordId,
                               @Param("scheduledStatus") String scheduledStatus,
                               @Param("deletedStatus") String deletedStatus,
                               @Param("deletedAt") LocalDateTime deletedAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE ExecutionWorkspaceCleanupEntity entity
               SET entity.status = :failedStatus,
                   entity.deletedAt = NULL,
                   entity.updatedAt = CURRENT_TIMESTAMP,
                   entity.deleteFailedAt = :failedAt,
                   entity.deleteErrorMessage = :errorMessage
             WHERE entity.id = :recordId
               AND entity.status = :scheduledStatus
            """)
    int markDeleteFailedIfScheduled(@Param("recordId") Long recordId,
                                    @Param("scheduledStatus") String scheduledStatus,
                                    @Param("failedStatus") String failedStatus,
                                    @Param("failedAt") LocalDateTime failedAt,
                                    @Param("errorMessage") String errorMessage);
}
