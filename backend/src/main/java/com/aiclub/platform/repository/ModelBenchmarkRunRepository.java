package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ModelBenchmarkRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ModelBenchmarkRunRepository extends JpaRepository<ModelBenchmarkRunEntity, Long>, JpaSpecificationExecutor<ModelBenchmarkRunEntity> {
}
