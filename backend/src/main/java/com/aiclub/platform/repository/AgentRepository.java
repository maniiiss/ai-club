package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AgentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.EntityGraph;

import java.util.List;
import java.util.Optional;

public interface AgentRepository extends JpaRepository<AgentEntity, Long>, JpaSpecificationExecutor<AgentEntity> {

    long countByProject_Id(Long projectId);

    List<AgentEntity> findAllByOrderByIdAsc();

    List<AgentEntity> findAllByEnabledTrueOrderByIdAsc();

    List<AgentEntity> findAllByProject_IdOrderByIdAsc(Long projectId);

    List<AgentEntity> findAllByProject_IdAndEnabledTrueOrderByIdAsc(Long projectId);

    List<AgentEntity> findAllByEnabledTrueAndProjectIsNullOrderByIdAsc();

    Optional<AgentEntity> findFirstByBuiltinCodeAndEnabledTrue(String builtinCode);

    /**
     * 执行中心会在仓储事务结束后使用图片理解 Agent，因此必须在查询阶段一并初始化模型配置。
     */
    @EntityGraph(attributePaths = "aiModelConfig")
    Optional<AgentEntity> findFirstByBuiltinCodeAndEnabledTrueOrderByIdAsc(String builtinCode);
}
