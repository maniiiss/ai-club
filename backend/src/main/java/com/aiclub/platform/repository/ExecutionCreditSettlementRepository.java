package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionCreditSettlementEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ExecutionCreditSettlementRepository extends JpaRepository<ExecutionCreditSettlementEntity, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select settlement
            from ExecutionCreditSettlementEntity settlement
            join fetch settlement.consumeTransaction transaction
            join fetch transaction.user
            where settlement.executionTask.id = :executionTaskId
            """)
    Optional<ExecutionCreditSettlementEntity> findByExecutionTaskIdForUpdate(@Param("executionTaskId") Long executionTaskId);
}
