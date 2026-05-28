package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiClubPipelineRunSnapshotEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiClubPipelineRunSnapshotRepository extends JpaRepository<AiClubPipelineRunSnapshotEntity, Long> {

    /**
     * 通过流水线与运行号定位唯一快照，供同步和触发后即时写回复用。
     */
    Optional<AiClubPipelineRunSnapshotEntity> findByPipeline_IdAndRunNumber(Long pipelineId, Integer runNumber);

    /**
     * 查询仍处于活动态的运行，用于轮询阶段重点关注未结束的流水线。
     */
    List<AiClubPipelineRunSnapshotEntity> findByStatusInOrderByIdAsc(List<String> statuses);
}
