package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradeCenterConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SelfUpgradeCenterConfigRepository extends JpaRepository<SelfUpgradeCenterConfigEntity, Long> {

    Optional<SelfUpgradeCenterConfigEntity> findFirstByOrderByIdAsc();
}
