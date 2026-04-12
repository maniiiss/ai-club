package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionStepEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExecutionStepRepository extends JpaRepository<ExecutionStepEntity, Long> {

    List<ExecutionStepEntity> findAllByRun_IdOrderByStepNoAscIdAsc(Long runId);
}
