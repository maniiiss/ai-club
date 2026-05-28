package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface AiClubPipelineRepository extends JpaRepository<AiClubPipelineEntity, Long>, JpaSpecificationExecutor<AiClubPipelineEntity> {

    /**
     * 按项目查询 AI Club Pipeline，项目级自动触发时优先走这里的内置 provider。
     */
    List<AiClubPipelineEntity> findByProject_IdOrderByIdAsc(Long projectId);

    /**
     * 同一项目内流水线名称保持唯一，避免首页和自动触发回显无法区分目标。
     */
    boolean existsByProject_IdAndName(Long projectId, String name);

    /**
     * 更新流水线时排除当前记录，再校验同项目重名。
     */
    boolean existsByProject_IdAndNameAndIdNot(Long projectId, String name, Long id);

    /**
     * 轮询同步时只扫描已经启用且已绑定 Woodpecker 仓库的流水线。
     */
    List<AiClubPipelineEntity> findByEnabledTrueAndWoodpeckerRepoIdIsNotNullOrderByIdAsc();
}
