package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TestPlanGiteeBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TestPlanGiteeBindingRepository extends JpaRepository<TestPlanGiteeBindingEntity, Long> {

    Optional<TestPlanGiteeBindingEntity> findByTestPlan_Id(Long testPlanId);
}
