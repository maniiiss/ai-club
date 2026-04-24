package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradePatrolTargetEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SelfUpgradePatrolTargetRepository extends JpaRepository<SelfUpgradePatrolTargetEntity, Long> {

    List<SelfUpgradePatrolTargetEntity> findAllByPlan_IdOrderBySortOrderAscIdAsc(Long planId);
}
