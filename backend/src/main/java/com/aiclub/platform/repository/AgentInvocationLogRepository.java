package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AgentInvocationLogEntity;
import com.aiclub.platform.dto.AgentTokenUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    /**
     * 按执行任务聚合未结算的 token 用量，按模型配置分组，供智能体终态结算计算积分成本。
     */
    @Query("""
            SELECT new com.aiclub.platform.dto.AgentTokenUsage(
                COALESCE(l.modelConfigId, 0L),
                COALESCE(SUM(l.promptTokens), 0L),
                COALESCE(SUM(l.completionTokens), 0L),
                COALESCE(SUM(l.cachedTokens), 0L))
            FROM AgentInvocationLogEntity l
            WHERE l.taskId = :taskId AND l.settleStatus IS NULL
            GROUP BY COALESCE(l.modelConfigId, 0L)
            """)
    List<AgentTokenUsage> aggregateTokenUsageByTaskGroupByModel(@Param("taskId") Long taskId);

    /**
     * 查询某执行任务下所有未结算的调用日志，用于回填 cost_credits 并标记 SETTLED。
     */
    List<AgentInvocationLogEntity> findAllByTaskIdAndSettleStatusIsNull(Long taskId);
}