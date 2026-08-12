package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitPilotCliAccessTokenEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/** GitPilot CLI Token 的持久化查询。 */
public interface GitPilotCliAccessTokenRepository extends JpaRepository<GitPilotCliAccessTokenEntity, Long> {
    Optional<GitPilotCliAccessTokenEntity> findByTokenHash(String tokenHash);
}
