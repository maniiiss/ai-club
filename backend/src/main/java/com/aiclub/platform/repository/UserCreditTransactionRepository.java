package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.UserCreditTransactionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserCreditTransactionRepository extends JpaRepository<UserCreditTransactionEntity, Long> {

    Page<UserCreditTransactionEntity> findAllByUser_Id(Long userId, Pageable pageable);

    Optional<UserCreditTransactionEntity> findFirstByUser_IdAndFeatureCodeIgnoreCaseAndBusinessKeyAndTransactionType(
            Long userId,
            String featureCode,
            String businessKey,
            String transactionType
    );
}
