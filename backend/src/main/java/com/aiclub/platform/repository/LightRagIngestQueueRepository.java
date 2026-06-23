package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.LightRagIngestQueueEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface LightRagIngestQueueRepository extends JpaRepository<LightRagIngestQueueEntity, Long> {

    /**
     * 抢占式拉取待处理记录，用 PESSIMISTIC_WRITE 锁 + locked_until 过滤避免多消费者重复处理。
     * 对应 PG 的 SELECT ... FOR UPDATE SKIP LOCKED 语义。
     */
    @Query("select q from LightRagIngestQueueEntity q " +
            "where q.status = 'PENDING' and (q.lockedUntil is null or q.lockedUntil < :now) " +
            "order by q.id asc")
    List<LightRagIngestQueueEntity> findPendingForPoll(@Param("now") LocalDateTime now, Pageable pageable);

    @Modifying
    @Query("update LightRagIngestQueueEntity q set q.status = :status, q.lockedUntil = :lockedUntil, " +
            "q.retryCount = q.retryCount + :retryDelta, q.lastError = :lastError " +
            "where q.id = :id")
    int updateStatus(@Param("id") Long id,
                     @Param("status") String status,
                     @Param("lockedUntil") LocalDateTime lockedUntil,
                     @Param("retryDelta") int retryDelta,
                     @Param("lastError") String lastError);

    List<LightRagIngestQueueEntity> findAllByNamespaceAndPageIdAndStatusOrderByIdAsc(String namespace, Long pageId, String status);

    long countByStatus(String status);
}
