package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectOwnerRepoBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface ProjectOwnerRepoBindingRepository extends JpaRepository<ProjectOwnerRepoBindingEntity, Long>, JpaSpecificationExecutor<ProjectOwnerRepoBindingEntity> {

    /**
     * 查询指定项目下的全部业主仓库绑定，按创建顺序返回。
     */
    List<ProjectOwnerRepoBindingEntity> findByProject_IdOrderByIdAsc(Long projectId);

    /**
     * 判断同一项目下是否已存在相同的业主仓库绑定，避免重复创建。
     */
    boolean existsByProject_IdAndApiBaseUrlAndGitlabProjectRef(Long projectId, String apiBaseUrl, String gitlabProjectRef);

    /**
     * 更新绑定时排除当前记录，再判断是否存在重复映射。
     */
    boolean existsByProject_IdAndApiBaseUrlAndGitlabProjectRefAndIdNot(Long projectId, String apiBaseUrl, String gitlabProjectRef, Long id);
}
