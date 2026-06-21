package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CreditFeatureConfigRepository extends JpaRepository<CreditFeatureConfigEntity, Long> {

    Optional<CreditFeatureConfigEntity> findByFeatureCodeIgnoreCase(String featureCode);

    boolean existsByFeatureCodeIgnoreCaseAndIdNot(String featureCode, Long id);

    List<CreditFeatureConfigEntity> findAllByOrderByIdAsc();
}
