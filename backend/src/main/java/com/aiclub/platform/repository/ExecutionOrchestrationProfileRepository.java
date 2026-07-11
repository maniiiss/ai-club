package com.aiclub.platform.repository;
import com.aiclub.platform.domain.model.ExecutionOrchestrationProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List; import java.util.Optional;
public interface ExecutionOrchestrationProfileRepository extends JpaRepository<ExecutionOrchestrationProfileEntity,Long>{
 Optional<ExecutionOrchestrationProfileEntity> findByScopeTypeAndScenarioCode(String scopeType,String scenarioCode);
 Optional<ExecutionOrchestrationProfileEntity> findByScopeTypeAndProject_IdAndScenarioCode(String scopeType,Long projectId,String scenarioCode);
 List<ExecutionOrchestrationProfileEntity> findAllByScopeTypeOrderByScenarioCodeAsc(String scopeType);
 List<ExecutionOrchestrationProfileEntity> findAllByScopeTypeAndProject_IdOrderByScenarioCodeAsc(String scopeType,Long projectId);
}
