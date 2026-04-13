package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface ProjectPipelineBindingRepository extends JpaRepository<ProjectPipelineBindingEntity, Long>, JpaSpecificationExecutor<ProjectPipelineBindingEntity> {

    /**
     * 按项目查询全部流水线绑定，用于同一项目触发多条 Jenkins 流水线。
     */
    List<ProjectPipelineBindingEntity> findByProject_IdOrderByIdAsc(Long projectId);
}
