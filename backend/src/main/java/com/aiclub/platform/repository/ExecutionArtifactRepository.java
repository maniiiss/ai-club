package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExecutionArtifactRepository extends JpaRepository<ExecutionArtifactEntity, Long> {

    List<ExecutionArtifactEntity> findAllByRun_IdOrderByCreatedAtAscIdAsc(Long runId);

    Optional<ExecutionArtifactEntity> findFirstByRun_IdAndArtifactTypeAndTitle(Long runId, String artifactType, String title);

    /**
     * 下载执行产物时需要同时读取运行、任务和项目，避免在控制器里触发懒加载异常。
     */
    @Query("""
            select artifact
            from ExecutionArtifactEntity artifact
            join fetch artifact.run run
            join fetch run.executionTask task
            join fetch task.project project
            where artifact.id = :id
            """)
    Optional<ExecutionArtifactEntity> findDetailById(@Param("id") Long id);
}
