package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SelfUpgradePatrolPlanRepository extends JpaRepository<SelfUpgradePatrolPlanEntity, Long>, JpaSpecificationExecutor<SelfUpgradePatrolPlanEntity> {

    List<SelfUpgradePatrolPlanEntity> findAllByEnabledTrueOrderByIdAsc();

    /** 统计引用指定模型配置的巡检计划数量，用于删除前依赖检查 */
    long countByAiModelConfig_Id(Long aiModelConfigId);
}
