package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.KnowledgeGraphEdgeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface KnowledgeGraphEdgeRepository extends JpaRepository<KnowledgeGraphEdgeEntity, Long> {

    @Modifying(flushAutomatically = true)
    @Query("delete from KnowledgeGraphEdgeEntity edge where edge.projectId = :projectId")
    void deleteAllByProjectId(@Param("projectId") Long projectId);

    List<KnowledgeGraphEdgeEntity> findAllByProjectIdOrderByEdgeTypeAscIdAsc(Long projectId);
}
