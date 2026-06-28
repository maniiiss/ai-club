package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatRoomAgentTaskEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ChatRoomAgentTaskRepository extends JpaRepository<ChatRoomAgentTaskEntity, Long> {

    List<ChatRoomAgentTaskEntity> findTop10ByStatusOrderByCreatedAtAscIdAsc(String status);

    List<ChatRoomAgentTaskEntity> findByRoom_IdOrderByCreatedAtDescIdDesc(Long roomId);

    boolean existsByTriggerTypeAndSourceRef(String triggerType, String sourceRef);

    /**
     * 以状态条件原子领取任务。
     * 业务意图：多消费者、重试回投或服务重启恢复时，同一个可运行任务只能被一个执行者切换到 RUNNING。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ChatRoomAgentTaskEntity task
            set task.status = :runningStatus,
                task.startedAt = :startedAt,
                task.updatedAt = :startedAt
            where task.id = :taskId
              and task.status in (:pendingStatus, :retryingStatus)
            """)
    int claimPendingTask(@Param("taskId") Long taskId,
                         @Param("pendingStatus") String pendingStatus,
                         @Param("retryingStatus") String retryingStatus,
                         @Param("runningStatus") String runningStatus,
                         @Param("startedAt") LocalDateTime startedAt);
}
