package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Hermes 轻量审计日志仓储。
 */
public interface HermesChatAuditRepository extends JpaRepository<HermesChatAuditEntity, Long> {
}
