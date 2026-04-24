package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradeWorkItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SelfUpgradeWorkItemRepository extends JpaRepository<SelfUpgradeWorkItemEntity, Long> {

    List<SelfUpgradeWorkItemEntity> findAllBySuggestion_IdOrderByIdDesc(Long suggestionId);

    Optional<SelfUpgradeWorkItemEntity> findFirstBySuggestion_IdAndStatusInOrderByIdDesc(Long suggestionId, List<String> statuses);
}
