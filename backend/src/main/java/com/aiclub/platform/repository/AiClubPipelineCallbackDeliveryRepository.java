package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiClubPipelineCallbackDeliveryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface AiClubPipelineCallbackDeliveryRepository extends JpaRepository<AiClubPipelineCallbackDeliveryEntity, Long> {

    /**
     * 同一运行进入同一状态时只允许创建一条投递记录，保证回调幂等。
     */
    Optional<AiClubPipelineCallbackDeliveryEntity> findByRunSnapshot_IdAndCallbackStatus(Long runSnapshotId, String callbackStatus);

    /**
     * 批量拉取待发送或允许重试的投递记录。
     */
    List<AiClubPipelineCallbackDeliveryEntity> findTop50ByDeliveryStatusInAndNextAttemptAtLessThanEqualOrderByIdAsc(
            List<String> deliveryStatuses,
            LocalDateTime nextAttemptAt
    );
}
