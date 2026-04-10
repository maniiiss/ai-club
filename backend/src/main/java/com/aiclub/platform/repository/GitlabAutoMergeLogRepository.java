package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface GitlabAutoMergeLogRepository extends JpaRepository<GitlabAutoMergeLogEntity, Long>, JpaSpecificationExecutor<GitlabAutoMergeLogEntity> {

    List<GitlabAutoMergeLogEntity> findByMergeRequestAuthorUsernameIgnoreCaseOrderByExecutedAtDesc(String mergeRequestAuthorUsername,
                                                                                                    Pageable pageable);
}
