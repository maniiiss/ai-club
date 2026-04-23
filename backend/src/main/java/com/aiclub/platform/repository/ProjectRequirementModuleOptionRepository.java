package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectRequirementModuleOptionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 负责项目级需求模块候选项的读取与持久化。
 */
public interface ProjectRequirementModuleOptionRepository extends JpaRepository<ProjectRequirementModuleOptionEntity, Long> {

    List<ProjectRequirementModuleOptionEntity> findAllByProject_IdOrderByModuleNameAscIdAsc(Long projectId);

    Optional<ProjectRequirementModuleOptionEntity> findByIdAndProject_Id(Long id, Long projectId);

    boolean existsByProject_IdAndModuleName(Long projectId, String moduleName);
}
