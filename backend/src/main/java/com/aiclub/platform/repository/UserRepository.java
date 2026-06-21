package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<UserEntity, Long>, JpaSpecificationExecutor<UserEntity> {

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCaseAndIdNot(String username, Long id);

    @Query("""
            select distinct u
            from UserEntity u
            left join fetch u.roles r
            left join fetch r.permissions
            where lower(u.username) = lower(:username)
            """)
    Optional<UserEntity> findByUsernameWithDetails(@Param("username") String username);

    @Query("""
            select distinct u
            from UserEntity u
            left join fetch u.roles r
            left join fetch r.permissions
            where u.id = :id
            """)
    Optional<UserEntity> findWithDetailsById(@Param("id") Long id);

    Optional<UserEntity> findByGitlabUsernameIgnoreCase(String gitlabUsername);

    List<UserEntity> findAllByEnabledTrueOrderByIdAsc();

    /**
     * 查询所有尚未开通积分账户的用户，用于后台批量补建历史用户的积分账户。
     */
    @Query("""
            select u
            from UserEntity u
            where not exists (
                select 1
                from UserCreditAccountEntity account
                where account.user.id = u.id
            )
            order by u.id asc
            """)
    List<UserEntity> findAllWithoutCreditAccount();

    @Query("""
            select distinct u
            from UserEntity u
            join u.roles r
            where u.enabled = true
              and lower(r.code) = lower(:roleCode)
            order by u.id asc
            """)
    List<UserEntity> findDistinctByRoleCodeAndEnabledTrueOrderByIdAsc(@Param("roleCode") String roleCode);
}
