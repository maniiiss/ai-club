package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface ServerInfoRepository extends JpaRepository<ServerInfoEntity, Long>, JpaSpecificationExecutor<ServerInfoEntity> {

    @EntityGraph(attributePaths = "alertRecipients")
    List<ServerInfoEntity> findAllByEnabledTrueOrderByIdAsc();
}
