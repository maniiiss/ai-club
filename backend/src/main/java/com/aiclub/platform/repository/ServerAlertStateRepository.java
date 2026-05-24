package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ServerAlertStateEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ServerAlertStateRepository extends JpaRepository<ServerAlertStateEntity, Long> {

    Optional<ServerAlertStateEntity> findByServer_IdAndAlertCode(Long serverId, String alertCode);

    List<ServerAlertStateEntity> findAllByServer_IdOrderByAlertCodeAsc(Long serverId);

    long countByServer_IdAndActiveTrue(Long serverId);
}
