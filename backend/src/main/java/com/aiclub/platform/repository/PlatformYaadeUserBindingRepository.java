package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformYaadeUserBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlatformYaadeUserBindingRepository extends JpaRepository<PlatformYaadeUserBindingEntity, Long> {

    Optional<PlatformYaadeUserBindingEntity> findByUserId(Long userId);
}
