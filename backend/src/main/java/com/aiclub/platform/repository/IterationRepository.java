package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.IterationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IterationRepository extends JpaRepository<IterationEntity, Long> {

    List<IterationEntity> findAllByProject_IdOrderBySortOrderAscIdAsc(Long projectId);

    Optional<IterationEntity> findByIdAndProject_Id(Long id, Long projectId);
}
