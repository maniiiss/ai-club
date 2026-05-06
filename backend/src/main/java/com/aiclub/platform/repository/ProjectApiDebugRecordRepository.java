package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectApiDebugRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectApiDebugRecordRepository extends JpaRepository<ProjectApiDebugRecordEntity, Long> {

    List<ProjectApiDebugRecordEntity> findTop20ByProject_IdOrderByCreatedAtDescIdDesc(Long projectId);

    List<ProjectApiDebugRecordEntity> findTop20ByProject_IdAndEndpoint_IdOrderByCreatedAtDescIdDesc(Long projectId, Long endpointId);

    List<ProjectApiDebugRecordEntity> findTop20ByProjectIsNullOrderByCreatedAtDescIdDesc();

    List<ProjectApiDebugRecordEntity> findTop20ByProjectIsNullAndEndpoint_IdOrderByCreatedAtDescIdDesc(Long endpointId);
}
