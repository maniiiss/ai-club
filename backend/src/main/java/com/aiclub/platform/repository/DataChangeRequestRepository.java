package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DataChangeRequestEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface DataChangeRequestRepository extends JpaRepository<DataChangeRequestEntity, Long>, JpaSpecificationExecutor<DataChangeRequestEntity> {

    @EntityGraph(attributePaths = {"project", "entity", "requesterUser", "approverUser", "executorUser", "rollbackUser"})
    Optional<DataChangeRequestEntity> findWithDetailsById(Long id);
}
