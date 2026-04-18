package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionStepEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExecutionStepRepository extends JpaRepository<ExecutionStepEntity, Long> {

    List<ExecutionStepEntity> findAllByRun_IdOrderByStepNoAscIdAsc(Long runId);

    Optional<ExecutionStepEntity> findByRun_IdAndStepNo(Long runId, Integer stepNo);

    Optional<ExecutionStepEntity> findByRunnerSessionId(String runnerSessionId);

    List<ExecutionStepEntity> findAllByStatusAndHasLiveStreamTrue(String status);
}
