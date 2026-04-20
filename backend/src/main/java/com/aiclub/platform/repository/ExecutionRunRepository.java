package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExecutionRunRepository extends JpaRepository<ExecutionRunEntity, Long> {

    long countByExecutionTask_Id(Long executionTaskId);

    List<ExecutionRunEntity> findAllByExecutionTask_IdOrderByRunNoDescIdDesc(Long executionTaskId);

    List<ExecutionRunEntity> findTop10ByExecutionTask_WorkItem_IdOrderByCreatedAtDescIdDesc(Long workItemId);

    /**
     * 事件序号需要在同一 run 内严格单调递增，这里通过悲观写锁串行化同一 run 的事件写入。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select run from ExecutionRunEntity run where run.id = :runId")
    Optional<ExecutionRunEntity> findByIdForUpdate(@Param("runId") Long runId);
}
