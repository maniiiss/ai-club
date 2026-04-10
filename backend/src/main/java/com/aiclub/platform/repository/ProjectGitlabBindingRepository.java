package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface ProjectGitlabBindingRepository extends JpaRepository<ProjectGitlabBindingEntity, Long>, JpaSpecificationExecutor<ProjectGitlabBindingEntity> {

    /**
     * 查询指定项目下的全部 GitLab 绑定，支持一个项目绑定多个仓库。
     */
    List<ProjectGitlabBindingEntity> findByProject_IdOrderByIdAsc(Long projectId);

    /**
     * 按创建顺序加载全部 GitLab 绑定，供前端列表与下拉框使用。
     */
    List<ProjectGitlabBindingEntity> findAllByOrderByIdAsc();

    /**
     * 统计指定项目当前已绑定的 GitLab 仓库数量。
     */
    long countByProject_Id(Long projectId);

    /**
     * 统计当前已启用的 GitLab 绑定数量。
     */
    long countByEnabledTrue();

    /**
     * 判断同一项目下是否已经存在相同 GitLab 仓库绑定，避免重复创建同一条映射。
     */
    boolean existsByProject_IdAndApiBaseUrlAndGitlabProjectRef(Long projectId, String apiBaseUrl, String gitlabProjectRef);

    /**
     * 更新绑定时排除当前记录，再判断是否存在重复的项目仓库映射。
     */
    boolean existsByProject_IdAndApiBaseUrlAndGitlabProjectRefAndIdNot(Long projectId, String apiBaseUrl, String gitlabProjectRef, Long id);
}
