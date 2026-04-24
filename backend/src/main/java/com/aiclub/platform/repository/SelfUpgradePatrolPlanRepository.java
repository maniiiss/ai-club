package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SelfUpgradePatrolPlanRepository extends JpaRepository<SelfUpgradePatrolPlanEntity, Long>, JpaSpecificationExecutor<SelfUpgradePatrolPlanEntity> {

    List<SelfUpgradePatrolPlanEntity> findAllByEnabledTrueOrderByIdAsc();
}
