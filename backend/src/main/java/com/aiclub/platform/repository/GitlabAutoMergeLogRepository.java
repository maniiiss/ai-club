package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface GitlabAutoMergeLogRepository extends JpaRepository<GitlabAutoMergeLogEntity, Long>, JpaSpecificationExecutor<GitlabAutoMergeLogEntity> {

    List<GitlabAutoMergeLogEntity> findByMergeRequestAuthorUsernameIgnoreCaseOrderByExecutedAtDesc(String mergeRequestAuthorUsername,
                                                                                                    Pageable pageable);

    /**
     * 读取同一 GitLab 项目与 MR 最近一次 AI 拒绝记录，供下一次复审沿用问题清单。
     */
    Optional<GitlabAutoMergeLogEntity> findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(String gitlabProjectRefSnapshot,
                                                                                                                                Long mergeRequestIid,
                                                                                                                                String result);
}
