package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface GitlabAutoMergeConfigRepository extends JpaRepository<GitlabAutoMergeConfigEntity, Long>, JpaSpecificationExecutor<GitlabAutoMergeConfigEntity> {

    List<GitlabAutoMergeConfigEntity> findAllByEnabledTrueOrderByIdAsc();

    /**
     * 查询指定 GitLab 绑定下的全部自动合并策略。
     */
    List<GitlabAutoMergeConfigEntity> findAllByBinding_IdOrderByIdAsc(Long bindingId);

    /**
     * 删除指定 GitLab 绑定下的全部自动合并策略。
     */
    void deleteAllByBinding_Id(Long bindingId);
}
