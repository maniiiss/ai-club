package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.SelfUpgradeEnvironmentProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SelfUpgradeEnvironmentProfileRepository extends JpaRepository<SelfUpgradeEnvironmentProfileEntity, Long> {

    List<SelfUpgradeEnvironmentProfileEntity> findAllByOrderByIdAsc();

    Optional<SelfUpgradeEnvironmentProfileEntity> findByCodeIgnoreCase(String code);
}
