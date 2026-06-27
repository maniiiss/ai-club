package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AgentInvocationLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 智能体调用日志仓储。
 */
@Repository
public interface AgentInvocationLogRepository extends JpaRepository<AgentInvocationLogEntity, Long>,
        JpaSpecificationExecutor<AgentInvocationLogEntity> {

    List<AgentInvocationLogEntity> findByCreatedAtBetweenOrderByCreatedAtDesc(LocalDateTime start, LocalDateTime end);
}