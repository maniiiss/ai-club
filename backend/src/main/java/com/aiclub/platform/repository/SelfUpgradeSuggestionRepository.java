package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradeSuggestionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface SelfUpgradeSuggestionRepository extends JpaRepository<SelfUpgradeSuggestionEntity, Long>, JpaSpecificationExecutor<SelfUpgradeSuggestionEntity> {

    Optional<SelfUpgradeSuggestionEntity> findByFingerprint(String fingerprint);
}
