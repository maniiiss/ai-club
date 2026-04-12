package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExecutionArtifactRepository extends JpaRepository<ExecutionArtifactEntity, Long> {

    List<ExecutionArtifactEntity> findAllByRun_IdOrderByCreatedAtAscIdAsc(Long runId);
}
