package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageSyncTaskV2Entity;
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
 * 空间化 Wiki 页面 Hindsight 同步任务仓储。
 */
public interface WikiPageSyncTaskV2Repository extends JpaRepository<WikiPageSyncTaskV2Entity, Long> {

    /** 轮询当前可执行的待同步任务。 */
    List<WikiPageSyncTaskV2Entity> findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
            String status,
            LocalDateTime nextAttemptAt,
            Pageable pageable
    );

    /** 读取页面最近一次 retain 同步任务，供手动重新排队时复用。 */
    Optional<WikiPageSyncTaskV2Entity> findFirstByPage_IdAndOperationOrderByIdDesc(Long pageId, String operation);

    /**
     * 原子领取空间化 Wiki 同步任务。
     * 业务意图：RabbitMQ 重复消息和多实例并发消费时，同步任务只能被一个消费者执行。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("""
            update WikiPageSyncTaskV2Entity task
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
