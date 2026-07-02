package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface DataWorkbenchEntityRepository extends JpaRepository<DataWorkbenchEntity, Long>, JpaSpecificationExecutor<DataWorkbenchEntity> {

    @EntityGraph(attributePaths = "fields")
    Optional<DataWorkbenchEntity> findWithFieldsById(Long id);

    @EntityGraph(attributePaths = "fields")
    Optional<DataWorkbenchEntity> findWithFieldsByEntityCode(String entityCode);

    @EntityGraph(attributePaths = "fields")
    List<DataWorkbenchEntity> findAllByEnabledTrueOrderByIdAsc();

    boolean existsByEntityCodeIgnoreCase(String entityCode);
}
