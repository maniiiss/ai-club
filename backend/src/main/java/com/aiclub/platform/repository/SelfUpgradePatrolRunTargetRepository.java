package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradePatrolRunTargetEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SelfUpgradePatrolRunTargetRepository extends JpaRepository<SelfUpgradePatrolRunTargetEntity, Long> {

    List<SelfUpgradePatrolRunTargetEntity> findAllByRun_IdOrderByIdAsc(Long runId);
}
