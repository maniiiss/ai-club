package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiClubPipelineCallbackWebhookEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiClubPipelineCallbackWebhookRepository extends JpaRepository<AiClubPipelineCallbackWebhookEntity, Long> {

    /**
     * 每条流水线最多一套回调配置。
     */
    Optional<AiClubPipelineCallbackWebhookEntity> findByPipeline_Id(Long pipelineId);

    /**
     * 扫描已启用回调的流水线，用于后续回调派发。
     */
    List<AiClubPipelineCallbackWebhookEntity> findByEnabledTrueOrderByIdAsc();
}
