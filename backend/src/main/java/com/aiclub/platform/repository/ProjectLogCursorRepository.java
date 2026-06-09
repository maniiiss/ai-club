package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ProjectLogCursorEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProjectLogCursorRepository extends JpaRepository<ProjectLogCursorEntity, Long> {

    Optional<ProjectLogCursorEntity> findByRuntimeInstance_IdAndSourcePath(Long runtimeInstanceId, String sourcePath);
}
