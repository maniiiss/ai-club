package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabUserOauthBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 当前登录用户的 GitLab OAuth 绑定仓储。
 */
public interface GitlabUserOauthBindingRepository extends JpaRepository<GitlabUserOauthBindingEntity, Long> {

    /**
     * 按平台用户 ID 查询对应的 GitLab OAuth 绑定。
     */
    Optional<GitlabUserOauthBindingEntity> findByUser_Id(Long userId);

    /**
     * 判断指定平台用户是否已经存在 GitLab OAuth 绑定。
     */
    boolean existsByUser_Id(Long userId);
}
