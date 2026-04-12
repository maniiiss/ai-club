package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformToolAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformToolAuditRepository extends JpaRepository<PlatformToolAuditEntity, Long> {
}
