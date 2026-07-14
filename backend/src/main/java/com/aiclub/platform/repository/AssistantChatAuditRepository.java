package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantChatAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Assistant 轻量审计日志仓储。
 */
public interface AssistantChatAuditRepository extends JpaRepository<AssistantChatAuditEntity, Long> {
}
