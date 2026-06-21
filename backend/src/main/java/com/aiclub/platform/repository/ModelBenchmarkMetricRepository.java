package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ModelBenchmarkMetricEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ModelBenchmarkMetricRepository extends JpaRepository<ModelBenchmarkMetricEntity, Long> {

    List<ModelBenchmarkMetricEntity> findAllByRunIdOrderByIdAsc(Long runId);

    void deleteByRunId(Long runId);
}
