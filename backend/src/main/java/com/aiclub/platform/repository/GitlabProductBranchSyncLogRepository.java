package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabProductBranchSyncLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GitlabProductBranchSyncLogRepository extends JpaRepository<GitlabProductBranchSyncLogEntity, Long> {

    List<GitlabProductBranchSyncLogEntity> findAllByBinding_IdOrderByExecutedAtDescIdDesc(Long bindingId);
}
