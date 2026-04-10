package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TestCaseEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestCaseRepository extends JpaRepository<TestCaseEntity, Long> {

    long countByTestPlan_Id(Long testPlanId);
}
