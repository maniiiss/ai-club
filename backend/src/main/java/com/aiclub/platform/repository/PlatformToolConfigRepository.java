package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformToolConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlatformToolConfigRepository extends JpaRepository<PlatformToolConfigEntity, Long> {

    Optional<PlatformToolConfigEntity> findByToolCode(String toolCode);
}
