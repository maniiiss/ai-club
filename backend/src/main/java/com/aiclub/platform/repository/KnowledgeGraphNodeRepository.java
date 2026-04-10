package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.KnowledgeGraphNodeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface KnowledgeGraphNodeRepository extends JpaRepository<KnowledgeGraphNodeEntity, Long> {

    boolean existsByProjectId(Long projectId);

    @Modifying(flushAutomatically = true)
    @Query("delete from KnowledgeGraphNodeEntity node where node.projectId = :projectId")
    void deleteAllByProjectId(@Param("projectId") Long projectId);

    List<KnowledgeGraphNodeEntity> findAllByProjectIdOrderByNodeTypeAscNameAsc(Long projectId);
}
