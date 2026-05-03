package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabCodeStructureSnapshotEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * GitLab 仓库代码结构快照仓库。
 */
public interface GitlabCodeStructureSnapshotRepository extends JpaRepository<GitlabCodeStructureSnapshotEntity, Long> {

    /**
     * 查询绑定仓库在指定分支上的最新快照。
     */
    Optional<GitlabCodeStructureSnapshotEntity> findByBinding_IdAndBranchName(Long bindingId, String branchName);

    /**
     * 查询绑定仓库最近一次成功或失败后保留的快照，用于默认分支回退。
     */
    Optional<GitlabCodeStructureSnapshotEntity> findFirstByBinding_IdOrderByGeneratedAtDescIdDesc(Long bindingId);
}
