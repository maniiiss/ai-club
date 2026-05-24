package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ServerTerminalSessionLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ServerTerminalSessionLogRepository extends JpaRepository<ServerTerminalSessionLogEntity, Long> {

    Optional<ServerTerminalSessionLogEntity> findBySessionId(String sessionId);
}
