package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TestPlanEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface TestPlanRepository extends JpaRepository<TestPlanEntity, Long>, JpaSpecificationExecutor<TestPlanEntity> {

    List<TestPlanEntity> findAllByProject_IdOrderByUpdatedAtDescIdDesc(Long projectId);
}
