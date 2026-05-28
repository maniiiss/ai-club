package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiClubPipelineCronJobEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiClubPipelineCronJobRepository extends JpaRepository<AiClubPipelineCronJobEntity, Long> {

    /**
     * 按流水线加载全部 cron，详情页统一展示和同步时都会复用。
     */
    List<AiClubPipelineCronJobEntity> findByPipeline_IdOrderByIdAsc(Long pipelineId);

    /**
     * 统计某条流水线绑定的 cron 数量，用于列表摘要展示自动化能力。
     */
    long countByPipeline_Id(Long pipelineId);

    /**
     * 校验同一条流水线下 cron 名称唯一。
     */
    boolean existsByPipeline_IdAndName(Long pipelineId, String name);

    /**
     * 编辑时排除当前记录，再校验重名。
     */
    boolean existsByPipeline_IdAndNameAndIdNot(Long pipelineId, String name, Long id);
}
