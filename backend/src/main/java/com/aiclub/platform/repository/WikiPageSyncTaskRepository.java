package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageSyncTaskEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Wiki 页面 Hindsight 同步任务仓储。
 */
public interface WikiPageSyncTaskRepository extends JpaRepository<WikiPageSyncTaskEntity, Long> {

    /** 按调度时间读取可执行的待同步任务。 */
    List<WikiPageSyncTaskEntity> findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
            String status,
            LocalDateTime nextAttemptAt,
            Pageable pageable
    );

    /** 读取页面最近一次 retain 同步任务，供手动重新排队时复用。 */
    Optional<WikiPageSyncTaskEntity> findFirstByPage_IdAndOperationOrderByIdDesc(Long pageId, String operation);

    /**
     * 原子领取 Wiki 同步任务。
     * 业务意图：RabbitMQ 可能重复投递，多实例消费时同一个同步任务只能被一个消费者切到 RUNNING。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("""
            update WikiPageSyncTaskEntity task
            set task.status = :runningStatus,
                task.attemptCount = task.attemptCount + 1,
                task.updatedAt = :updatedAt
            where task.id = :syncTaskId
              and task.status = :pendingStatus
              and task.nextAttemptAt <= :now
            """)
    int claimQueuedTask(@Param("syncTaskId") Long syncTaskId,
                        @Param("pendingStatus") String pendingStatus,
                        @Param("runningStatus") String runningStatus,
                        @Param("now") LocalDateTime now,
                        @Param("updatedAt") LocalDateTime updatedAt);
}
