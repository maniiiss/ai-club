package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.NotificationMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface NotificationMessageRepository extends JpaRepository<NotificationMessageEntity, Long>, JpaSpecificationExecutor<NotificationMessageEntity> {

    long countByRecipientUser_IdAndReadFlagFalse(Long recipientUserId);

    Optional<NotificationMessageEntity> findByIdAndRecipientUser_Id(Long id, Long recipientUserId);
}
