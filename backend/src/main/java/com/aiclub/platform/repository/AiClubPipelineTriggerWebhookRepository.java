package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiClubPipelineTriggerWebhookEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AiClubPipelineTriggerWebhookRepository extends JpaRepository<AiClubPipelineTriggerWebhookEntity, Long> {

    /**
     * 每条流水线最多一套公开触发配置。
     */
    Optional<AiClubPipelineTriggerWebhookEntity> findByPipeline_Id(Long pipelineId);
}
