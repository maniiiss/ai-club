package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformEnvVarConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlatformEnvVarConfigRepository extends JpaRepository<PlatformEnvVarConfigEntity, Long> {

    Optional<PlatformEnvVarConfigEntity> findByEnvKey(String envKey);
}
