package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TestCaseGiteeBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TestCaseGiteeBindingRepository extends JpaRepository<TestCaseGiteeBindingEntity, Long> {

    List<TestCaseGiteeBindingEntity> findAllByTestPlan_IdOrderByIdAsc(Long testPlanId);
}
