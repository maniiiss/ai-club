package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradeSuggestionOccurrenceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SelfUpgradeSuggestionOccurrenceRepository extends JpaRepository<SelfUpgradeSuggestionOccurrenceEntity, Long> {

    List<SelfUpgradeSuggestionOccurrenceEntity> findAllBySuggestion_IdOrderByFoundAtDescIdDesc(Long suggestionId);
}
