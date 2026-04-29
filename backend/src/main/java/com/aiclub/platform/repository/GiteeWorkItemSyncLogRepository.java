package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GiteeWorkItemSyncLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GiteeWorkItemSyncLogRepository extends JpaRepository<GiteeWorkItemSyncLogEntity, Long> {

    List<GiteeWorkItemSyncLogEntity> findTop20ByIteration_IdOrderByExecutedAtDescIdDesc(Long iterationId);
}
