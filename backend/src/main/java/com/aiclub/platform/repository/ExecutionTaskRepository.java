package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ExecutionTaskRepository extends JpaRepository<ExecutionTaskEntity, Long>, JpaSpecificationExecutor<ExecutionTaskEntity> {

    List<ExecutionTaskEntity> findTop10ByStatusOrderByCreatedAtAscIdAsc(String status);

    /**
     * 调度链路会在事务外长期持有执行任务实体，因此这里把运行所需的基础上下文一次性抓取出来，
     * 避免后续访问 workItem/project/createdByUser 时再触发懒加载。
     */
    @Query("""
            select task
            from ExecutionTaskEntity task
            left join fetch task.project
            left join fetch task.workItem
            left join fetch task.createdByUser
            left join fetch task.currentRun
            where task.id = :id
            """)
    Optional<ExecutionTaskEntity> findWithExecutionContextById(@Param("id") Long id);

    /**
     * 直接读取取消标记，避免长事务内命中一级缓存导致看不到最新取消状态。
     */
    @Query("select task.cancelRequested from ExecutionTaskEntity task where task.id = :id")
    Boolean findCancelRequestedFlagById(@Param("id") Long id);

    /**
     * 以状态条件原子领取执行任务。
     * 业务意图：RabbitMQ 可能重复投递，多个后端实例也可能同时消费，同一任务只能被一个执行者切到 RUNNING。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("""
            update ExecutionTaskEntity task
            set task.status = :runningStatus,
                task.latestSummary = :runningSummary,
                task.updatedAt = :updatedAt
            where task.id = :executionTaskId
              and task.status in (:pendingStatus, :retryingStatus)
            """)
    int claimQueuedTask(@Param("executionTaskId") Long executionTaskId,
                        @Param("pendingStatus") String pendingStatus,
                        @Param("retryingStatus") String retryingStatus,
                        @Param("runningStatus") String runningStatus,
                        @Param("runningSummary") String runningSummary,
                        @Param("updatedAt") LocalDateTime updatedAt);
}
