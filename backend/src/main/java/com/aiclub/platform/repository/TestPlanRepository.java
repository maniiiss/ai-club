package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TestPlanEntity;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface TestPlanRepository extends JpaRepository<TestPlanEntity, Long>, JpaSpecificationExecutor<TestPlanEntity> {

    List<TestPlanEntity> findAllByProject_IdOrderByUpdatedAtDescIdDesc(Long projectId);

    /**
     * 自动化执行链路需要在异步线程里访问项目、自动化仓库、测试用例和步骤，
     * 这里统一拉平，避免脱离事务后再次触发懒加载。
     */
    @Query("""
            select distinct plan
            from TestPlanEntity plan
            left join fetch plan.project
            left join fetch plan.iteration
            left join fetch plan.automationBinding
            left join fetch plan.cases testCase
            where plan.id = :id
            """)
    Optional<TestPlanEntity> findAutomationContextById(@Param("id") Long id);

    /**
     * Gitee 测试推送只在这里加载计划、项目与迭代基础上下文。
     * 测试用例和步骤会通过独立查询读取，避免 Hibernate 对两个 List 集合同时 fetch join
     * 触发 MultipleBagFetchException。
     */
    @Query("""
            select distinct plan
            from TestPlanEntity plan
            left join fetch plan.project
            left join fetch plan.iteration
            where plan.id = :id
            """)
    Optional<TestPlanEntity> findGiteePushContextById(@Param("id") Long id);
}
