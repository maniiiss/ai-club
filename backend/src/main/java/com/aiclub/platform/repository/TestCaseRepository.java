package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TestCaseEntity;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TestCaseRepository extends JpaRepository<TestCaseEntity, Long>, JpaSpecificationExecutor<TestCaseEntity> {

    long countByTestPlan_Id(Long testPlanId);

    /**
     * 自动化执行链路需要在异步线程里一次性拿到步骤集合，
     * 避免在脱离事务后访问 `steps` 再触发懒加载。
     */
    @Query("""
            select distinct testCase
            from TestCaseEntity testCase
            left join fetch testCase.steps
            where testCase.testPlan.id = :testPlanId
            order by testCase.sortOrder asc, testCase.id asc
            """)
    List<TestCaseEntity> findAutomationCasesWithStepsByTestPlanId(@Param("testPlanId") Long testPlanId);
}
