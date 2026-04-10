package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface ProjectPipelineBindingRepository extends JpaRepository<ProjectPipelineBindingEntity, Long>, JpaSpecificationExecutor<ProjectPipelineBindingEntity> {

    /**
     * 按项目查询流水线绑定，用于项目级流水线触发。
     */
    Optional<ProjectPipelineBindingEntity> findByProject_Id(Long projectId);
}
