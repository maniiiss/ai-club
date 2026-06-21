package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.UserCreditAccountEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface UserCreditAccountRepository extends JpaRepository<UserCreditAccountEntity, Long> {

    Optional<UserCreditAccountEntity> findByUser_Id(Long userId);

    @Query("""
            select account
            from UserCreditAccountEntity account
            join account.user user
            where lower(user.username) like lower(concat('%', :keyword, '%'))
               or lower(user.nickname) like lower(concat('%', :keyword, '%'))
            """)
    Page<UserCreditAccountEntity> searchByUserKeyword(@Param("keyword") String keyword, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select account
            from UserCreditAccountEntity account
            join fetch account.user
            where account.user.id = :userId
            """)
    Optional<UserCreditAccountEntity> findByUserIdForUpdate(@Param("userId") Long userId);
}
