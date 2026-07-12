package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

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

    /**
     * 人工写回只允许读取指定技术设计执行任务最新成功运行中的最终设计产物。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select artifact
            from ExecutionArtifactEntity artifact
            join fetch artifact.run run
            join fetch run.executionTask task
            join fetch task.project project
            join fetch task.workItem workItem
            where task.id = :executionTaskId
              and artifact.id = :artifactId
              and run.status = 'SUCCESS'
              and run.runNo = (
                  select max(successRun.runNo)
                  from ExecutionRunEntity successRun
                  where successRun.executionTask.id = task.id
                    and successRun.status = 'SUCCESS'
              )
              and task.scenarioCode = 'TECHNICAL_DESIGN_AUTHORING'
              and artifact.artifactType = 'TECHNICAL_DESIGN_MARKDOWN'
            """)
    Optional<ExecutionArtifactEntity> findTechnicalDesignWritebackArtifact(@Param("executionTaskId") Long executionTaskId,
                                                                           @Param("artifactId") Long artifactId);

    @Query("""
            select case when count(artifact) > 0 then true else false end
            from ExecutionArtifactEntity artifact
            join artifact.run run
            join run.executionTask task
            where task.id = :executionTaskId
              and artifact.artifactType = 'TECHNICAL_DESIGN_MARKDOWN'
              and length(trim(artifact.contentText)) > 0
            """)
    boolean existsValidTechnicalDesignArtifact(@Param("executionTaskId") Long executionTaskId);

    /**
     * 按关联需求查找最新成功的技术设计产物，供开发执行创建时固化上游设计快照。
     */
    @Query("""
            select artifact
            from ExecutionArtifactEntity artifact
            join fetch artifact.run run
            join fetch run.executionTask task
            join fetch task.workItem designWorkItem
            where designWorkItem.requirementTask.id = :requirementTaskId
              and task.scenarioCode = 'TECHNICAL_DESIGN_AUTHORING'
              and run.status = 'SUCCESS'
              and artifact.artifactType = 'TECHNICAL_DESIGN_MARKDOWN'
              and length(trim(artifact.contentText)) > 0
            order by artifact.createdAt desc, artifact.id desc
            """)
    Page<ExecutionArtifactEntity> findLatestSuccessfulTechnicalDesignArtifact(
            @Param("requirementTaskId") Long requirementTaskId,
            Pageable pageable);
}
