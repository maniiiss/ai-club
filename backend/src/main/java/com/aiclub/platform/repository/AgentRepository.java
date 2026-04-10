package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AgentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface AgentRepository extends JpaRepository<AgentEntity, Long>, JpaSpecificationExecutor<AgentEntity> {

    long countByProject_Id(Long projectId);

    List<AgentEntity> findAllByOrderByIdAsc();

    List<AgentEntity> findAllByEnabledTrueOrderByIdAsc();

    List<AgentEntity> findAllByProject_IdOrderByIdAsc(Long projectId);

    List<AgentEntity> findAllByProject_IdAndEnabledTrueOrderByIdAsc(Long projectId);

    List<AgentEntity> findAllByEnabledTrueAndProjectIsNullOrderByIdAsc();
}
