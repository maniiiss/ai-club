package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionStepEventEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExecutionStepEventRepository extends JpaRepository<ExecutionStepEventEntity, Long> {

    @EntityGraph(attributePaths = {"run", "step"})
    List<ExecutionStepEventEntity> findAllByRun_IdOrderBySequenceNoAsc(Long runId);

    @EntityGraph(attributePaths = {"run", "step"})
    List<ExecutionStepEventEntity> findAllByRun_IdAndSequenceNoGreaterThanOrderBySequenceNoAsc(Long runId, Long sequenceNo);

    Optional<ExecutionStepEventEntity> findFirstByRun_IdOrderBySequenceNoDesc(Long runId);
}
