package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergeProjectShareEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 项目级自动合并日志分享配置仓库。
 */
public interface GitlabAutoMergeProjectShareRepository extends JpaRepository<GitlabAutoMergeProjectShareEntity, Long> {

    /**
     * 每个项目当前只保留一条分享配置。
     */
    Optional<GitlabAutoMergeProjectShareEntity> findByProject_Id(Long projectId);
}
