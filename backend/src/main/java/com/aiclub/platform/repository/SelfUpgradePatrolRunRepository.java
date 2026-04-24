package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradePatrolRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface SelfUpgradePatrolRunRepository extends JpaRepository<SelfUpgradePatrolRunEntity, Long>, JpaSpecificationExecutor<SelfUpgradePatrolRunEntity> {
}
