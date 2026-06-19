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

    /**
     * 读取同一 GitLab 项目、MR 与版本指纹下最近一条可复用的结构化审查结果。
     */
    Optional<GitlabAutoMergeLogEntity> findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndReviewFingerprintAndReviewResultJsonIsNotNullOrderByExecutedAtDescIdDesc(String gitlabProjectRefSnapshot,
                                                                                                                                                                          Long mergeRequestIid,
                                                                                                                                                                          String reviewFingerprint);

    /**
     * webhook 投递前读取同一 MR 作用域下的上一条日志，便于判断状态键是否真的发生变化。
     */
    Optional<GitlabAutoMergeLogEntity> findTopByConfig_IdAndMergeRequestIidAndIdLessThanOrderByIdDesc(Long configId,
                                                                                                        Long mergeRequestIid,
                                                                                                        Long id);

    /**
     * EMPTY / 全局失败类日志没有 MR IID 时，按配置级别读取上一条日志做 webhook 去重。
     */
    Optional<GitlabAutoMergeLogEntity> findTopByConfig_IdAndMergeRequestIidIsNullAndIdLessThanOrderByIdDesc(Long configId,
                                                                                                              Long id);
}
